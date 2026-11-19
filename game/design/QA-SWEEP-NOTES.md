# QA sweep notes (S10)

Test: `game/tests/site-links.test.js` (about 25 s). It crawls the town, hub, Mad Maze (solo and `?mode=dungeon&seed=1`), Lantern,
Angler, Bug Safari and Deepdelve. Per page it checks: title, viewport meta, zero console and page errors, no 4xx/5xx,
no off-origin requests (town: phaser, firebase and three CDNs; Deepdelve: three CDN), every internal link returns 200,
and no horizontal scroll at 390x844. It also plays each loop (cast, net swing, mine, dungeon room, create hero, hub node)
and walks hub -> Hearthvale `?from=hub` -> Back pill -> hub.

Extra probe (not committed): every page loads with garbage JSON, `null` and blocked localStorage in the save keys with zero errors.

## Fixed in this PR (new pages only, each with a test assertion)

| # | Sev | Bug | Repro | Owner |
|---|-----|-----|-------|-------|
| 1 | Medium | The Lantern was a navigation dead end: no link back to the hub or town. | Hub -> Lantern node; only "Start run" exists. | games/mad-maze/lantern.html (added Hub and Town links) |
| 2 | Medium | The hub's Deepdelve node showed "Coming soon" although `games/deepdelve/index.html` ships. | Hub -> World 3 -> Deepdelve -> card says Coming soon. | hub/hub.js LINKS (added `w3-deepdelve`) |

## Open, not fixed

| # | Sev | Issue | Repro | Owner |
|---|-----|-------|-------|-------|
| 3 | Medium | Mad Maze "Leave" (button, Esc, death summary "Back to town") always goes to `../../index.html`. A player who came from the hub lands on the town join screen with no Back pill, so the hub round trip breaks. | Hub -> Catacombs -> Leave. | games/mad-maze/mad-maze.js (`HOME`); could use `../../index.html?from=hub` or the hub |
| 4 | Low | Deepdelve shows the desktop hint "Click the view to look around. Hold left to mine, right to place. WASD + Space." on touch devices that have Jump/Mine/Place buttons. | Phone viewport, load page. | games/deepdelve/deepdelve.js:578 |
| 5 | Low | Hub header on a fresh profile reads "Villager" and the world line is truncated ("Pixeltown Crossroads - Pixeltown ...") at 390 px. | Hub at 390x844 with empty storage. | hub/hub.css, hub/hub.js |
| 6 | Low | Hub map on a phone is letterboxed: about 40% of the viewport is empty above and below the canvas. | Hub at 390x844. | hub/hub.css |
| 7 | Low | Bug Safari arena picker is a scroll box clipped at the bottom on phones. Pond Edge and Forest are cut mid-card with no scroll cue, and the other arenas are off-screen. | bugs.html at 390x844. | games/festival/bugs.css (`#overlay`) |
| 8 | Low | Lantern "Start run" is an `<a href="./index.html">` that is only marked `aria-disabled` when no hero exists; middle-click or long-press still opens the Mad Maze with no hero. | Lantern with no heroes, middle-click Start run. | games/mad-maze/lantern.js:363 |
| 9 | Info | Mad Maze, Lantern, Angler, Bug Safari and the hub link to the town as `../../index.html` without `?from=hub`, so only the hub's Hearthvale node produces the Back pill. Consistent, but the pill is the only way back. | Any game -> Town. | design decision |
| 10 | Info | The town (live code) loads Phaser, Firebase and three.js from CDNs, so "no off-origin requests" only holds with those whitelisted. No town bugs were found: zero console errors on desktop and phone, no horizontal scroll. | Town crawl. | game/index.html (not edited) |

## Live town files (main.js, realm.js, net.js, index.html, style.css)

No defects found by the sweep. Nothing was edited.

## Verified clean

All internal links return 200 (about 90 URLs across pages, plus 5 hub node targets). No page raised a console or page error, including with
corrupt or blocked storage. The hub -> Hearthvale -> Back pill -> hub trip works. ADMIN bots never chatted; the live
`players.json` has 0 ADMIN entries after the run.
