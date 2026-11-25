# Round 4 brief (owner-approved 2026-11-23, live chat). All five dev agents and all 15 testers read this first.

## Goal / release gate
Zero P0/P1; every reproducible P2 resolved; each of the 15 test areas >= 9/10 (tester's own rating, honest); all automated checks pass (`tools/stamp.sh --shards 4`); real gameplay verified on desktop AND phone; no regressions/broken assets/missing deps. Master merge is done by the manager only after a green stamp. Never claim a fix without functional verification (a test that fails before and passes after, plus a gameplay replay by a tester).

## Owner decisions (decided, do not re-ask)
1. O-01 Arcade doors: replace "GTA 3"/"NFS Underground 2"/"Vice City" (main.js ~1136-1141, shared/mm-map.js) with original neutral names: **City Drive, Night Racer, Neon Coast** (4th door: **Kart Rally**). Keep the third-party links only if each opens in a new tab with rel=noopener and a "leaves the game" hint; otherwise remove the link and show a "Coming soon" card. No feature removed that is not a trademark.
2. O-10 Town statue label "Mayor" + monkey emoji -> **"Founder's Statue"** with a hero emoji (no ape). Art: Codex hero-statue sprite (CODEX-REMAKE-QUEUE); until it lands use a code-drawn hero statue.
3. O-04 Backups: ONE Backup that covers every game save key and all settings (except device-specific / hardware flags), used from Town, Lantern and Hub. Restore accepts old town-only files, old Lantern bundles and the new bundle; validates + skips damaged/unknown keys with a named message (already implemented for unknown keys); shows a preview/confirm; never writes anything on failure; version stamp + compatibility check. Additive keys only.
4. O-08 Arcane Frontier: repair the 15 missing files if the scaffold is salvageable in this round; otherwise make index.html a styled "Coming soon" card with a Home link AND add the intended entry point (Hub card) only when the page really works. Either way: no 404s, no console errors.
5. O-02 firebase rules / net.js: still off limits; document only. O-03 night wash: stays off. O-06/O-07 defaults from TRIAGE.md stand (Stalk neighbour capped at stall +15%). O-09/O-11 backlog. Document every other noncritical call in game/design/beta/ROUND4-DECISIONS.md.

## Priorities
P2 before any P3 polish. Then: art/graphics (with Codex), new player experience (target 9/10: onboarding, early-game survival on the Shore, touch controls, a11y), performance (Deepdelve frame spikes, Realm rotation stall, Town fps) without losing visual quality, mobile overlaps/navigation/scaling, Arcane Frontier, then P3s.

## Dev team (5), file ownership
- D1 Gameplay + Onboarding: realm.js combat/survival, new-player first 5 minutes, Hub Home/tutorial, jam/angler/stalk logic, loot/forge, Isles taming logic. Target b08 new player >= 9.
- D2 World + Graphics + Art: realm-world.js, terrain, scaling table (W-06 creature/NPC scale), empty Isles screens, art integration, Codex branches (fetch/merge/register/wire by id with code fallbacks), statue.
- D3 Performance + Systems: Deepdelve spikes, Realm rotation stall, Town fps, listeners, backup (O-04), save safety, three.js/asset loading, net-adjacent docs only.
- D4 Mobile + UI + Accessibility + Arcade: phone overlaps, touch controls, navigation (Back button, Tab order, focus), contrast, arcade games UI (Dash fold, Stack floats, Bug Safari summary, Angler 260 px), door renames, Town menus.
- D5 QA + Integration + Arcane Frontier: verification of every claimed fix (functional), test-tiers hygiene, Arcane Frontier repair, owner-decision docs, TEAM-BOARD/TRIAGE upkeep, merge-readiness report, stamps.
Shared files (main.js, realm.js, index.html, test-tiers.json): small commits, rebase on the tip often, announce on TEAM-BOARD.md.

## Rules that never bend (AGENTS.md)
Live Firebase: never chat/write/delete; tests use ADMIN* bots only or the offline stub / blockDb. Do not edit firebase-config.js or net.js. pixeltown-save-v1 stays backward-compatible (additive keys). Original art only (ART-HANDOFF.md). No weakening/skipping tests; honest test updates only when behaviour intentionally changed, named in the commit. Never push to master. Run everything through /tmp/bt.sh; each agent its own port.

## STANDING OWNER DECISION 2026-11-25 ("Don't need my ok ever")
The owner no longer wants to be asked. The coordinator (Claude) decides every open owner call, documents it here, and may merge a green-stamped
dev tip to master. AGENTS.md "rules that never bend" are NOT affected (live Firebase untouched, firebase-config.js/net.js untouched, no secrets,
original art only, additive saves, never skip or weaken a test).
Decisions taken now:
- **L-08 game day:** anything shared or paid out uses the UTC game day (mm-gameday.js); the player's local calendar is for display only.
- **ID-09 streaks:** approved in a forgiving form only (a missed day never costs progress; no guilt or fake-urgency text), additive save key.
- **ID-18 bounties:** approved: wire mm-bounties as a Town card; free currency only.
- **art-integration / pinned creature-list tests:** may be edited ADDITIVELY to register new Codex art (never weakened or loosened).
- **ID-14 hit pause:** threshold 15% -> 12% of max HP (a level-matched hero takes at most 12.3% per bolt, so the pause actually fires).
- **ID-51 idle-hero rest:** approved (no provoke/aggro on a hero with no input for 8 s; any input restores normal rules).
- **Deepdelve depth label:** keep "Surface" at ground and absolute depth below; medal thresholds unchanged.
- **Master:** a stamped dev tip is merged to master by the coordinator after each green stamp (fast-forward only).
