# Navigation audit: every world and minigame, played as a new player (2026-11-22)

The owner asked to "look over the entire game flow and make all worlds and mini games simpler to navigate". This file is the evidence and the plan.

**How it was done.** A Playwright bot (`game/tools/nav-audit/run.js`) played every entry point as a brand-new player (empty localStorage) on a **phone** (390x844, touch, `isMobile`) and on **desktop** (1280x720). It counted taps and seconds, measured every visible control (size, whether something covers it, which control is the way back and where it sits), and took screenshots. The screenshots named below are in `game/design/nav-audit/`, and I looked at each one.

**Safety.** Every browser context blocked HTTP and WebSocket traffic to `firebase|googleapis|gstatic|firebasedatabase|firebaseio|identitytoolkit|securetoken` before any page loaded. The Town was joined with **Play offline** under the name `ADMINnav`. The bot never chats and never writes to the database. Across all runs no WebSocket was opened, and every matching HTTP request was aborted before it reached the network (the bot logs the counts per run).

**Caveats.**
- Blocking gstatic means the Firebase SDK never loads, so the Town join screen shows a developer error ("Not connected to a Firebase project yet"). Real players do not see that text.
- On Isles, the Realm and the Town, the bot **teleports** between points of interest (to the gate, the portal, the dock or a creature) instead of walking. Walking time is reported separately where it matters.
- The Isles and Realm sub-flows use `?test=1` hooks. The hub, the minigames and the Town use the real URLs.

Reproduce:

```
python3 -m http.server 8951 &                     # repo root
NODE_PATH=$(npm root -g) node game/tools/nav-audit/run.js           # all; STEP=pages|town|hub|isles|realm|games, ONLY=phone|desk
```

---

## 0. The map of what links to what (as it is today)

```
Town (game/index.html)  -- walk to the Realm Gate + A --> gate menu --> "Enter the Realm" (in-page iframe: mad-maze ?mode=world)
   |                                                    \-> "Classic arena" (in-town arena)
   |-- "In town" panel (collapsed chip on phones) -> "World map" link --> Hub (game/hub/)
Hub  -- reachable nodes for a new player: W0 Square, Gate (-> Town), Snack (soon), First Steps (soon), W1 Hearthvale (-> Town), W7 Isles
     -- Lantern / Deepdelve / Angler / Bug Safari / Campfire Jam / Stalk Market: LOCKED, and Jam + Stalk have no Play link even when unlocked
Realm (?mode=world) -- Nexus portal -> Nexus plaza -> biome portals -> dungeons -> "Back to the world" (same spot)
                    -- Nexus "Vault" -> lantern.html ; Leave -> Town join screen (or the Hub with ?from=hub)
Isles -- left arrow -> Hub ; "Home" -> home dock ; Sail (only at a dock) -> other isles ; portal -> Realm
Minigames -- header "Hub" / "Town" links (different place, style and label on every page)
Arcane Frontier (games/arcane-frontier/) -- linked from nowhere, 15 of its files 404
```

**The biggest finding is that a new player cannot reach five of the eight minigames at all, and reaches a sixth (the Lantern) only through a Realm portal.** Two things combine:

- No page ever calls `MMHubProfile.report()`, and the level nodes (`w0-first`, `w1-museum`, ...) are "Coming soon" cards. The world map can therefore never unlock past W0, W1 and W7.
- Campfire Jam (`w5-jam`) and Stalk Market (`w5-stalk`) are missing from `LINKS` in `hub/hub.js`, so their cards would say "Coming soon" even when unlocked.

The Town links only to the Realm and the Hub. Deepdelve, Angler, Bug Safari, Campfire Jam and Stalk Market have no reachable entry point anywhere. The Lantern is reachable only through the Realm Nexus "Vault" portal.

---

## 1. Journey table (taps and seconds from first load, phone / desktop)

Taps count every tap, click or key press a player needs. Typing a name counts as 1. Seconds are wall time in the bot, which includes the ~0.5 s it waits after each tap and the page loads.

| # | Journey | Phone taps / s | Desk taps / s | Verdict | Evidence |
|---|---|---|---|---|---|
| J1 | Town first load -> Realm first fight | 8 / 18.1 + ~4 s walk | 8 / 19.6 + ~4 s walk | **Poor**: a 6 s wait for "Play offline" (when the DB is unreachable), then the Realm Gate has no on-screen pointer (564 px away, up and left of spawn), then a gate menu with 2 confusing choices, a hero picker and a 6-card tutorial | phone-01-town-offline-offer, phone-02-town-arrived, phone-04-gate-menu, phone-06-realm-playing |
| J2 | Town -> World map -> Campfire Jam first song | 2 to reach the map (phone: open the "In town" chip first), then **impossible** | 1, then **impossible** | **Broken**: Jam is locked on the map, and its card has no Play link | phone-09-town-panel-open, phone-13-hub-locked-toast |
| J3 | Hub first load -> Isles first screen | 4 optimal (tap an unlabeled path off the right edge, close the arrival card, tap the next unlabeled edge, Play) ~8 s; **10 / 13.8 s** for a curious player who tries "Open" and First Steps first | 10 / 13.3 | **Poor**: no labels on the map, the target world is off-screen, and 2 of the 3 obvious first taps are dead ends ("Coming soon") | phone-p-hub, phone-11-hub-open-square, desk-12-hub-first-steps-soon, phone-14-hub-world-hop, phone-15-hub-isles-card |
| J4 | Isles first load -> first tame | 1 Soothe + 14 Feed taps, 20 s, **still only 3/6** (mashing Feed does nothing and the hint never says "slower"); FTUE metric: first tame after 55-67 s of play | same | **Fair** (fun, but the pace rule is hidden) | phone-18-isles-feed-prompt |
| J5 | Isles home dock -> Coral Reef | Home 1 + Sail 1 + Reef 1 = 3 taps / 10 s, then **blocked** ("needs a raft (craft it)"; the locked row has no button to open Craft) | same | **Dead end** | phone-21-isles-sea-chart, phone-23-isles-craft |
| J6 | Realm (direct URL) first load -> first fight | 1 (pick a class) + tutorial (Skip), first kill at 2.7-3.3 s (ftue-metrics) | same | **Good** | phone-p-realm |
| J7 | Realm -> Nexus -> dungeon portal -> back to the world | 4 taps + ~15 s walking (portalWalk metric 14.8-16.1 s) / 14.9 s | 4 / 15.1 | **Good** (returns to the same spot), but the exit is labelled 3 different ways | phone-33-nexus, phone-35-dungeon, phone-36-dungeon-summary |
| J8 | Realm (inside the Town) -> back to the Town | 2 (menu, "Leave to start") / 2.8 s | 2 (Esc, Leave) / 2.9 s | **OK**, but the label "Leave to start" is wrong (it goes back to the Town), and the menu button looks like a settings gear | phone-07-realm-pause, phone-08-back-in-town |
| J9 | Isles -> back | 1 tap on an unlabeled "←" / 1.6 s, which lands on the **Hub**, not where you came from | same | **Confusing** (Isles also has a "Home" button that means the home dock) | phone-p-isles |
| J10 | Any minigame or Realm -> Town | Jam / Bugs / Angler / Deepdelve / Lantern: 1 tap, but the "Town" link sits in a different place on each page. Stalk (from the hub) and Isles: no Town link. Hub: no Town button (walk to the Gate node + Play = 2 taps + walk). The standalone Realm "Leave" goes to the **Town join form with an empty name** = 1 + 4 to rejoin | 1 to 7 | **Inconsistent** | phone-p-stalk, desk-p-hub, desk-37-realm-leave |
| G | Minigame first load -> first fun action (direct URL) | Jam 2 (Got it, Easy) · Bugs 1 · Stalk 1 · Angler 1 · Deepdelve 1 · Lantern 4 (Create is refused until a name is typed, Start run sits below the fold) | same | **Good once you are inside**; the problem is getting there | phone-p-jam, phone-p-bugs, phone-p-lantern, phone-40-lantern-playing |

What this adds up to:
- **Inside** a game, things are mostly fine: the minigames reach the fun in 1-2 taps.
- **Getting between** games is where the experience breaks: locked or missing links, an unlabeled map, and back controls that differ on every page.
- **Tap targets are mostly OK.** The game pages have 0 controls under 44 px thanks to `mm-access`. The exceptions are the Town and Arcane Frontier.

---

## 2. Top-20 problems (ranked)

Severity: **S1** blocks a player or loses them · **S2** confuses or costs many taps · **S3** polish.

| # | Sev | Page | Problem | Evidence |
|---|---|---|---|---|
| 1 | S1 | Hub (`hub/hub.js`, `shared/mm-map.js`) | **Five of the eight minigames cannot be reached by a new player** (the Lantern only through the Realm Nexus). The map never unlocks: no game reports a result, and the level nodes are all "Coming soon". Deepdelve, Angler, Bug Safari, Jam and Stalk are linked from nowhere else. | phone-13-hub-locked-toast, desk-12-hub-first-steps-soon |
| 2 | S1 | Hub | `LINKS` is missing `w5-jam` and `w5-stalk`, so both say "Coming soon" even when reachable. `w2-catacombs` and `w2-lantern` exist but are locked. | `hub/hub.js` lines 20-29 |
| 3 | S1 | Hub | **No way back to the Town** and no Back/Home control at all. The only exits are the "Hearthvale Gate" and "Hearthvale" nodes, which are unlabeled on the map. | phone-p-hub, desk-p-hub |
| 4 | S1 | Hub | **No node labels and no legend.** The phone hides the only hint (`.hint { display:none }` under 480 px). Worlds W1 and W7 are reached by tapping unlabeled paths that run off the screen edge. "Open" opens the card of the square you stand on, which is "Coming soon". | phone-p-hub, phone-14-hub-world-hop |
| 5 | S1 | Town | The Realm Gate (the main adventure) has **no on-screen pointer**. It is ~4 s of walking up and left from spawn, and its "Tap A to enter the Realm" label appears only when you are next to it. | phone-02-town-arrived |
| 6 | S2 | Town (phone) | "World map" is hidden in the collapsed "👥 1 · 🏆 0/62 ▾" chip and is a plain small text line inside the panel. | phone-09-town-panel-open |
| 7 | S2 | all pages | **The back control differs on every page:** "Hub"+"Town" buttons top-left (Angler, Deepdelve, Lantern), "← Hub" left + "Town" right as text links (Jam, Bugs), "← Town" or "← Hub" only (Stalk), an unlabeled "←" (Isles), "Leave"/"Exit" top-right (Realm/dungeon), nothing (Hub). | phone-p-angler, phone-40-jam-playing, phone-p-stalk, phone-p-isles, phone-35-dungeon |
| 8 | S2 | Realm | **One action, five labels:** "Leave", "Leave Mad Maze" (aria), "🚪 Leave to start", "Exit", "Back to the world", plus "Back to the map: leave Mad Maze" on the Lantern-started arena. | phone-07-realm-pause, phone-35-dungeon, phone-36-dungeon-summary |
| 9 | S2 | Realm | **Two gear icons that do different things.** The top-right gear is the **Menu** (`#realm-menu-btn`, drawn with `icon_settings`) and the bottom gear is Settings. The bottom gear also stays visible over open modals (backpack), so the overlays stack. | phone-06-realm-playing, phone-31-realm-backpack, desk-p-madmaze-plain |
| 10 | S2 | Town gate menu | "Enter the Realm" vs "⚔️ Classic arena" is unexplained jargon. The co-op/duel text is shown even offline ("Team play needs the online town"). The ✕ close is 29x25 px. | phone-04-gate-menu, desk-04-gate-menu |
| 11 | S2 | Naming (all) | One place, many names: **Town / Hearthvale / Pixeltown / Pixeltown Square / Hearthvale Gate**. **Hub / World map / the map / Pixeltown Hub**. **Realm / Mad Maze / Classic arena / The Lantern / Vault**. On Isles, **"Home"** means the home island's dock, not the game home. | many |
| 12 | S2 | Realm standalone Leave | Leaving the Realm (opened from Isles or a bookmark) drops the player on the **Town join form with an empty name**: 1 + 4 taps to get back in. | desk-37-realm-leave |
| 13 | S2 | Isles | The locked sea-chart rows ("needs a raft (craft it)") have no Craft button. A phone hint says "Press T or Sail". The Craft panel is a long list with no "what to do next". | phone-21-isles-sea-chart, phone-23-isles-craft |
| 14 | S2 | Isles | The first tame hides its pace rule: Feed mashing does nothing and the hint only says "Stay calm and feed it ... 1/6". | phone-18-isles-feed-prompt |
| 15 | S2 | Jam, Bugs (phone) | The full-screen "how to play" or arena sheet covers the header's ← Hub / Town links (7 covered controls on Jam). Bugs adds a third link, "← Back to the hub", and its unlock rule reads "2 x (its number - 1)". | phone-p-jam, phone-p-bugs |
| 16 | S2 | Lantern | A **second, separate hero system** from the Realm hero picker. Create is refused until a name is typed (browser "Please fill out this field"). "Start run" is above the form but disabled, and the page is 3,227 px long on a phone. Start run opens the classic arena, not the Realm. | phone-p-lantern, phone-40-lantern-playing |
| 17 | S2 | Hub card | The Isles card lists 17 medals as "[ ] First tame" text boxes and pushes **Play** to the bottom edge. There is no one-line description of the game anywhere on the map. | phone-15-hub-isles-card |
| 18 | S3 | Town join / Deepdelve / Isles | Desktop keyboard help on touch devices: "WASD/arrows to walk · E to interact" (join), "Click the view to look around. Hold left to mine, right to place. WASD + Space" (Deepdelve), "Press T" (Isles). | phone-01-town-offline-offer, phone-p-deepdelve |
| 19 | S3 | Town join | 21 species tabs at 28 px tall (< 44) wrap into 7 rows before the avatar grid. "Join Town" can take 6 s before "Play offline" is offered. | phone-01-town-offline-offer |
| 20 | S3 | Arcane Frontier | `games/arcane-frontier/index.html` is an orphan page that 404s on `style.css` + 14 JS files and renders raw buttons 21 px tall with horizontal scroll (648 px wide on a 390 px phone). Hide it or finish it. | phone-p-arcane |

Also seen, each small on its own:
- The Nexus portal labels are cut off at the stage edge ("dow", "Bran"), and the Nexus is walk-only.
- The Stalk Market shows "week 2969".
- The hub card overlaps the footer hint on desktop.
- "Play the Daily world" in the plain arena is covered by the gear button.

---

## 3. What good looks like (research, generic sources)

- **One back control, always in the same place.** Platform guidance agrees: keep the back button in a fixed, conventional spot ([Windows dev blog](https://blogs.windows.com/windowsdeveloper/?p=37990)), keep a persistent way back with prompts that stay the same across the game, and keep repeated components in the same order ([Xbox Accessibility Guideline 112](https://devdocs.xbox.com/gaming/accessibility/xbox-accessibility-guidelines/112)). Inconsistent back buttons and shifting menus add effort ([Apple WWDC17 #811](https://developer.apple.com/videos/play/wwdc2017/811)). Back must never silently quit or do nothing ([Android dev blog](https://android-developers.googleblog.com/2011/12/more-android-games-that-play-nice.html)).
- **Shallow depth, back arrow over breadcrumbs on mobile.** Breadcrumbs are rare in mobile apps, and an up/back arrow in the top bar is the default ([NN/g](https://www.nngroup.com/articles/breadcrumbs/), [Visa design system](https://design.visa.com/components/breadcrumbs/usage/), [Material navigation](https://material.io/design/navigation), [LogRocket](https://blog.logrocket.com/ux-design/breadcrumbs-vs-back-arrow-ux-best-practices)). With 2 or fewer levels, use a back button and do not combine it with breadcrumbs ([Dynatrace](https://developer.dynatrace.com/design/components/navigation/Breadcrumbs/usage/)). Our hierarchy is only 2 deep (Home -> a world -> a sub-area), so a breadcrumb is unnecessary; a title next to the back button is enough.
- **Maps need a list alternative.** Give a non-scrolling way to reach map content, such as a list that centers the map on the chosen place, and make markers big ([Xbox AG 112](https://devdocs.xbox.com/gaming/accessibility/xbox-accessibility-guidelines/112), [Android game controller practices](https://developer.android.com/games/sdk/game-controller/recommended-practices)). This is exactly the "Where to?" sheet below.
- **Bottom tab bars and reach.** Use five or fewer destinations, clear the iOS home indicator (~34 pt safe area), and make targets 44 pt minimum, 48 preferred ([Smashing: bottom navigation](https://smashingmagazine.com/2016/11/the-golden-rules-of-mobile-navigation-design), [Smashing: target sizes](https://www.smashingmagazine.com/2023/04/accessible-tap-target-sizes-rage-taps-clicks), [Smashing: thumb zone](https://www.smashingmagazine.com/2016/09/the-thumb-zone-designing-for-mobile-users)). The thumb-zone model is a default, not a law ([Smashing: one-hand usage](https://smashingmagazine.com/2020/02/design-mobile-apps-one-hand-usage/)). Our games already own the bottom corners (sticks, A/B, Fire), so navigation goes in a **top corner** and the *sheet* opens from the bottom.
- **"Continue" must say where it goes.** A Continue that drops players somewhere unexpected breaks trust, so label the destination ([Wayline: the broken promise of Continue](https://www.wayline.io/blog/broken-promise-continue-video-game-save-ux)).
- **Progressive disclosure.** Reveal features in context and do not repeat tips already seen ([Apple: onboarding for games](https://developer.apple.com/app-store/onboarding-for-games/), [GDevelop on tutorials](https://gdevelop.io/blog/improve-game-tutorials), [Acagamic: progressive disclosure](https://medium.com/the-acagamic-tip-tuesday/the-acagamic-tip-tuesday-11-progressive-disclosure-e3822dac00a)). For us that means showing every game in the "Where to?" list from day 1 (each opens directly), and keeping medals and locks as optional goals rather than gates.

---

## 4. Redesign proposal: one shared nav ("mm-nav")

### 4.1 What the player sees (every page, the same)

1. **One corner button, top-left, always.** `#mm-nav-btn`: a 48x48 px rounded square with a compass icon and the word **"Menu"** on desktop (icon only under 480 px, `aria-label="Menu: where to go"`). It sits at `top: calc(8px + env(safe-area-inset-top)); left: calc(8px + env(safe-area-inset-left))`, with `z-index: 9000` (above game HUDs, below the page's own full-screen modals, which close it).
   - Every page's existing Hub/Town/← links stay in the DOM (we never remove features) but get the class `mm-nav-legacy`. mm-nav hides that class visually, keeps the links focusable for tests, and keeps them shown when `?nav=0`.
   - The top-left corner is free or freeable on every page:
     - Angler, Deepdelve, Lantern, Jam, Bugs and Stalk use it for the links being replaced.
     - Isles uses it for `#back`.
     - The Realm uses it for the HP bar. There the Realm HUD gets a `body.mm-nav-on #realm-hp { margin-left: 56px }` offset; on phones the HP bar is 140 px wide and fits.
     - The Hub uses it for `#hud-name`.
     - In the Town it is the inventory panel. **The Town is special: see 4.4.**
2. **"Where to?" sheet.** `#mm-nav-sheet`, `role="dialog" aria-modal="true"`, a bottom sheet on phones (max-height 85vh, scrolls) and a centered 520 px card on desktop. Contents in this order:
   - **Continue** row (`#mm-nav-continue`): "Continue: Hearthvale Isles - Coral Reef" with the game icon. It is shown only when the last place differs from the current page.
   - **Back** row (`#mm-nav-back`): "Back to <where you came from>", from `document.referrer` when it is same-origin and on the allow-list, otherwise "Town". This replaces every page's own Hub/Town pair.
   - **Grid of destinations** (`.mm-nav-dest`, 2 columns on phone, 3 on desktop, each at least 64 px tall, icon 32 px + name + one line). Every world and game from the catalogue below, **always unlocked** (locks and medals live on the Hub map as goals, never as gates).
   - Footer: "World map" (the Hub) and "Settings" (calls the page's own settings if it registered one via `MMNav.onSettings(fn)`), plus ✕ Close (`#mm-nav-close`, 48 px).
   - The sheet closes on Esc, on the ✕, and on a backdrop tap. Opening it pauses the game if the page registered `MMNav.onOpen/onClose` hooks: the Realm pauses its arena, and the others ignore them. **It never stacks:** opening it closes any `.mm-nav-sheet` already open, and a page modal opening sends `MMNav.close()`.
3. **Consistent names** (catalogue, `shared/mm-nav.js`, `MMNav.PLACES`):

| id | Icon | Name shown | One-line description | URL (from /game/) |
|---|---|---|---|---|
| town | 🏡 | Town | Walk, chat, fish and build with friends | `index.html` |
| map | 🧭 | World map | Every world on one map; earn medals | `hub/index.html` |
| realm | 🌀 | The Realm | Big adventure: heroes, loot, dungeons | `games/mad-maze/index.html?mode=world` |
| lantern | 🏮 | Lantern Camp | Your heroes, stash and fountain | `games/mad-maze/lantern.html` |
| isles | 🏝️ | Isles | Tame creatures, sail between islands | `games/isles/index.html` |
| jam | 🎸 | Campfire Jam | Rhythm game: tap the four lanes | `games/jam/index.html` |
| bugs | 🦋 | Bug Safari | Catch bugs in 90-second runs | `games/festival/bugs.html` |
| angler | 🎣 | Angler | Calm fishing, ponds and a journal | `games/angler/index.html` |
| deepdelve | ⛏️ | Deepdelve | Dig, mine and build underground (3D) | `games/deepdelve/index.html` |
| stalk | 🥬 | Stalk Market | Buy low, sell high, once a week | `games/stalk/index.html` |

   Renames are display-only, so no URL or save key changes:
   - "Mad Maze" becomes "The Realm" in visible labels and aria.
   - "Leave", "Exit", "Leave to start" and "Leave Mad Maze" become **"Leave"** (the leave button) plus "Back to <dest>" (the summary or menu).
   - "Hub" becomes **"World map"**.
   - "Hearthvale Gate" becomes "Town Gate".
   - Isles "Home" becomes **"Home dock"**.
   - The Nexus "Vault" becomes **"Lantern Camp"**.
   - "Classic arena" becomes "Quick arena (one room)".
4. **Continue / last place.** `MMNav.markPlace(id, sub?)` is called by mm-nav on load (id from the catalogue match, sub from the page, for example the isle name). It writes the **new, additive** key `pixeltown-nav-v1` = `{v:1, last:{id, sub, url, t}, prev:{...}}`. The URL is validated against the catalogue allow-list (same pattern as `RETURN_RE`). It **never touches `pixeltown-save-v1`**. Add the key to the `mm-backup.js` key list so backups include it.
5. **The Hub map becomes optional.** Every node of type `game` gets a Play link: add the missing `w5-jam` and `w5-stalk` to `LINKS`. The Hub also gets a "Where to?" button (mm-nav) and **labels under game nodes** (canvas text, 8 px pixel font at the current zoom), a phone hint chip "Tap a place to walk there", and a **"Town" destination** at the top of the sheet. Locked map paths stay as a medal game but no longer gate the games themselves (problem #1 is solved by the sheet, not by changing unlock rules).
6. **Tap targets:** every mm-nav element is at least 48x48 px. Pages that keep old links get `.mm-nav-legacy` (hidden), so no page loses its 44 px compliance.

### 4.2 Files

**New (additive, no Firebase, no imports of `net.js`, `firebase-config.js` or `realm.js`):**
- `game/shared/mm-nav.js`: a UMD-style IIFE exposing `window.MMNav`: `PLACES`, `mount(opts)`, `open()`, `close()`, `markPlace()`, `last()`, `onOpen/onClose/onSettings`, `cleanUrl()` (allow-list), `mount({ page:'jam', backLegacy:'#back-hub,#back-town', avoid:'#realm-hp' })`. It auto-mounts on `DOMContentLoaded` if `<script data-page="...">` is set. It does nothing when `?nav=0` and does nothing when `window !== window.top` (the Realm inside the Town iframe keeps its own Leave, which posts `close-realm`). It must be pure enough that `require()` works in node tests (no DOM at load time), as `mm-map.js` does.
- `game/shared/mm-nav.css`: `#mm-nav-btn`, `#mm-nav-sheet`, `.mm-nav-dest`, `.mm-nav-legacy{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}`, dark/light tokens, `prefers-reduced-motion`, safe-area insets.
- `game/tests/shared-mm-nav.test.js` (node class): catalogue URLs exist on disk, `cleanUrl` rejects off-list and `javascript:` URLs, the `pixeltown-nav-v1` round-trip, `markPlace` never writes other keys.
- `game/tests/nav-consistency.test.js` (browser class, blockDb): see 4.5.

**Edited (2 lines each: `<link rel="stylesheet" href=".../shared/mm-nav.css">` + `<script src=".../shared/mm-nav.js" data-page="ID"></script>`, plus label and legacy-class tweaks):**
- `game/hub/index.html`, `hub/hub.js`: LINKS for `w5-jam`, `w5-stalk`; node labels; a phone hint chip; `#hud-name` shifted right by 56 px.
- `games/jam/index.html`, `games/festival/bugs.html` (+ `bugs.js`: the in-sheet "← Back to the hub" gets `mm-nav-legacy`), `games/stalk/index.html`, `games/angler/index.html`, `games/deepdelve/index.html`, `games/mad-maze/lantern.html`: the old links get class `mm-nav-legacy`.
- `games/isles/index.html` + `isles.js`: `#back` gets `mm-nav-legacy`; "Home" becomes "Home dock"; the locked sea-chart rows get a "Craft it" button that calls `openPanel('craft')`; the touch hint drops "Press T".
- `games/mad-maze/index.html` + `mad-maze.js`/`realm.js` (label-only): "Leave to start" becomes "Leave", the aria "Leave Mad Maze" becomes "Leave the Realm", the top-right menu icon becomes a ☰ icon instead of a gear, and the bottom gear hides while any `[role=dialog]` is open. Register `MMNav.onOpen(() => pause)`.
- `games/mad-maze/realm-world.js`: the Nexus label "Vault" becomes "Lantern Camp" (display only).
- `game/shared/mm-backup.js`: add `pixeltown-nav-v1` to the key list (additive).
- `games/arcane-frontier/index.html`: leave it (not linked). Optionally add `<meta name="robots" content="noindex">`. Do **not** add it to the catalogue.

**Not touched, ever:** `game/net.js`, `game/firebase-config.js`, `firebase-rules.draft.json`, the `pixeltown-save-v1` format.

### 4.3 Data flow, safety

- mm-nav reads and writes only `pixeltown-nav-v1` (wrapped in try/catch, with storage-blocked fallbacks), and reads `document.referrer` for Back.
- It has no network calls and never loads any Firebase script. A node test can assert that `mm-nav.js` contains no `firebase`, `fetch(` or `WebSocket`.
- Every destination URL comes from the frozen `PLACES` table. Query strings are only carried over from an allow-list (`from`, `isle`, `seed` for the Realm, `test`).

### 4.4 The Town (live multiplayer): the safe way

- **Phase 1 (this wave): the Town does not load mm-nav on its play screen.** Instead, add a **"🧭 Where to?"** button inside the existing HUD (`#player-list-panel`, directly under the panel toggle, *outside* the collapsible part, so it is visible on phones while the chip is collapsed). The button is plain `index.html` markup plus a `<script src="shared/mm-nav.js">` with `data-page="town"` and `data-mount="manual"`. The click handler (in an inline module or a 10-line addition to `main.js` UI code, nowhere near `net.js`) calls `MMNav.open()`. Leaving goes through the **same `location.href` navigation** that "World map" uses today: no new presence or DB code path. The player leaves the town the same way they leave for the Hub today.
- **Town wayfinding (no network):** a small HUD chip **"🌀 Realm Gate ↑"** that points toward `REALM_GATE_POS` while you are more than 300 px from it and are on day 1 or have not entered the Realm yet. This is local-only state in the existing save as a **new additive key** (`seenRealmGate: true`), or in `pixeltown-nav-v1` to avoid touching the save at all (**preferred**).
- The join screen gets a **"Continue: <last place>"** link above "Join Town" when `pixeltown-nav-v1.last` exists and is not the Town. Players coming back from a minigame can go straight back without joining.
- The gate menu: rename "Classic arena" (label only), enlarge ✕ to 44 px, and collapse the co-op and duel text into a `<details>` titled "Play with friends" when nobody is online.
- Tests for the Town use `blockDb(ctx)` **plus** a page-level `routeWebSocket` and *Play offline*, as this audit did, and assert `db.ws.length === 0`.

### 4.5 Acceptance checks every page must pass (one browser test, both viewports)

For each catalogue page (and the Town after joining offline):

1. `#mm-nav-btn` is visible and **at least 48x48 px**. Its centre is the top element at that point (`elementFromPoint`), so nothing covers it, including first-run sheets such as the Jam "How to play" and the Bugs arena sheet.
2. It sits within 16 px of the top-left corner, plus the safe area, at both viewports.
3. Tapping it opens `#mm-nav-sheet` with all 10 destinations. **Exactly one** `[role=dialog][aria-modal=true]` is visible, so there is no stacking. Esc and ✕ close it, and focus returns to the button.
4. Every destination `href` resolves with HTTP 200 (no 404), and the page you land on mounts mm-nav (closed loop).
5. Back: open A, then B through the sheet, then "Back" lands on A.
6. Continue: after visiting Isles (reef) and loading the Town join screen, "Continue: Isles - Coral Reef" is shown, and one tap lands on `isles/index.html?isle=reef`.
7. No visible control on the page is under 44 px (the existing `mm-access` check), and no horizontal scroll at 390 px.
8. In the Realm inside the Town iframe, `#mm-nav-btn` is **absent**, and the Realm Leave still closes the embed.
9. `pixeltown-save-v1` is byte-identical before and after the test (only `pixeltown-nav-v1` changed). DB attempts are 0 WebSocket, and HTTP attempts are only aborted ones.
10. Taps budget, re-run with `game/tools/nav-audit/run.js`:

| Journey | Today | Target |
|---|---|---|
| Any page -> any game | up to impossible | ≤ 2 taps (Menu, game) |
| Any page -> Town | 1-7 taps | ≤ 2 taps |
| Town -> Realm first fight | 8 taps + finding the gate | ≤ 4 taps after join (Where to?, Realm, pick class, Skip) |

### 4.6 Sliced build plan (one wave, 5 agents in parallel)

The contract between slices is the `MMNav` API in 4.2. Slice A lands the module first as a ~1 hour stub with the final API; the others code against the stub and rebase.

| Slice | Owner | Size | Files | Tests | Done when |
|---|---|---|---|---|---|
| **A: mm-nav core** | agent 1 | M | `shared/mm-nav.js`, `shared/mm-nav.css`, `shared/mm-backup.js` (key), `tests/shared-mm-nav.test.js` | node test: catalogue, `cleanUrl`, storage round-trip, no-network grep, iframe no-op, `?nav=0` no-op | Checks 1-3 and 9 pass on a fixture page `tests/fixtures/nav-fixture.html` |
| **B: minigame pages** | agent 2 | S | Jam, Bugs (+ `bugs.js` sheet link), Stalk (+ `stalk.js`), Angler, Deepdelve, Lantern html: include + `mm-nav-legacy`; Deepdelve/Isles touch hints | `tests/nav-consistency.test.js` (browser, blockDb) for these 6 pages | Checks 1-7 at 390x844 + 1280x720; existing jam/bugs/stalk/angler/deepdelve/lantern tests still pass (legacy links still in the DOM) |
| **C: Realm + dungeon + Nexus labels** | agent 3 | M | `games/mad-maze/index.html`, `mad-maze.js`, `realm.js` (labels and icon only), `realm-world.js` ("Vault" label), `dungeon.js` (summary button text), `#realm-hp` offset | extend nav-consistency for `?mode=world` and `?mode=dungeon` + an embed check (8) via `tests/fixtures/world-party.html` or a Town-offline embed | One exit label ("Leave" / "Back to ..."), a ☰ menu icon, no gear over modals, pause on sheet open, checks 1-8 |
| **D: Hub + Isles** | agent 4 | M | `hub/index.html`, `hub/hub.js` (LINKS jam/stalk, node labels, phone hint chip, hud offset), `hub/hub.css`; `games/isles/index.html`, `isles.js` ("Home dock", sea-chart "Craft it" button, `markPlace` sub = isle) | existing hub/isles tests + nav-consistency for hub and `isles?isle=reef/tundra/mars/meadow` | Jam/Stalk cards have Play; every `game` node shows a label; check 6 (Continue to reef) passes |
| **E: Town (safe)** | agent 5 | M | `index.html` (button in `#player-list-panel` above the collapsible area, join-screen Continue link, gate menu label + ✕ 44 px + `<details>`), small UI-only hook in `main.js` (gate pointer chip, reading `pixeltown-nav-v1`) | live-class test rewritten as **offline**: blockDb + Play offline; checks 1-3, 6, 9; `db.ws.length === 0`; full `node game/tests/run-all.js` | Town -> any game ≤ 2 taps after join; gate pointer visible on first spawn; `net.js` / `firebase-config.js` diff is empty |

**Merge order:** A, then B, C, D in any order, then E last (the riskiest page, and it needs the shared Continue data in place). After the merge, re-run `game/tools/nav-audit/run.js` and update the journey table in this file.

**Out of scope for the wave** (record on TEAM-BOARD):
- Wiring games to `MMHubProfile.report()` so the map medals finally move. The map stays a bonus.
- Arcane Frontier.
- A single shared hero system for the Lantern and the Realm.
