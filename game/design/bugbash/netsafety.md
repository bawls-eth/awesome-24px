# Bug bash lane: live-DB / netcode safety review (bb-netsafety)

Scope: every Firebase write path, every place untrusted strings reach the DOM, hostile presence data, test hygiene
against the live DB, URL params / nav memory, a secrets scan. Read-only for `net.js`, `main.js`, `firebase-config.js`
and the rules draft: the fixes below are for their owners.

New tests in this lane (both registered in `test-tiers.json`):
- `game/tests/live-safety.test.js` (node, smoke): static scan of every test. It fails if a non-live test joins the town,
  loads the Town page or opens a socket without blockDb (route + routeWebSocket), any test touches net.js / TownNet /
  firebase-config or sends REST writes to a DB host, a live test chats or writes shared content, a live bot types a
  non-ADMIN name, or run-all loses the flock wrapper. It also self-tests its own detectors.
- `game/tests/net-hostile-presence.test.js` (browser, full): the Town joins through an in-page FAKE Firebase SDK with
  blockDb on (0 requests, 0 sockets). Hostile `/players`, `/chat`, `/guestbook`, `/blocks`, `/realmInvites/{me}` and
  `/walkie/{me}` records go through the real net.js and main.js code: 20k-character names, markup, bidi and control
  characters, object, array and number species and frames, `__proto__` / `constructor` keys, unknown `hero_*` keys,
  `__MISSING`, NaN-like positions, 300-record floods. Checks: no page error, no injected element or script, names
  capped at 16, real hero textures only, the loop keeps running, and the only writes are our own presence, the counter
  and read-once deletes in our own inboxes.

Fixed in this lane:
- **realm-playthrough.test.js joined the LIVE town as `Offline` (not an ADMIN* name).** It blocks the DB hosts with
  `ctx.route()` only, which does not stop the SDK WebSocket, so the bot really joined live presence. It is now
  `ADMINplaythru`. The static test now catches this.

## Findings (open, for owners)

### P1-1 The rules draft rejects what real clients write (deploy blocker for `firebase-rules.draft.json`)
- `players/$id/facing` is `newData.isString()`, but net.js writes `facing: 1 | -1` (number) on join, rejoin and every
  move. If the owner pastes the draft, every join fails ("database write was rejected").
  The `shared-rules-draft.test.js` fixture uses `facing: 'down'`, so its test passes anyway.
  Fix: `"facing": { ".validate": "newData.isNumber() && (newData.val() === 1 || newData.val() === -1)" }`, and change
  the fixture to `facing: 1`. Better still, build the fixture from the exact object `TownNet.join()` writes.
- `realmParties/$party/h/ev/$i/d` allows only a number or a string, but realm-team.js sends `d` as an ARRAY (for
  example `[x, y, angle, speed, kind]`, or `[text, seconds]` for 'bn'). Every host snapshot with an event would be
  rejected, which breaks co-op, duel and 2v2.
  Fix: `"d": { ".validate": "newData.hasChildren()", "$j": { ".validate": "$j.matches(/^[0-7]$/) && ((newData.isNumber() && newData.val() >= -1000000 && newData.val() <= 1000000) || (newData.isString() && newData.val().length <= 80))" } }`.
  Add a draft-test case built from a real `RealmTeam` host snapshot.
- `walkie/$target/$push/data` allows at most 200000 characters. A 15 s iOS AAC clip (`audio/mp4`, about 128 kbps) is
  about 320 KB of base64, so it would be rejected silently.
  Fix: in main.js `startRecording`, pass `{ mimeType: supported, audioBitsPerSecond: 32000 }`, which keeps 15 s under
  about 80 KB. Also add the size guard from P1-2 in net.js.

### P1-2 Walkie-talkie: unsolicited audio, unchecked fields, world-readable voice clips (main.js setupWalkie, net.js sendWalkie)
- Any client can push to `walkie/{anyId}`, and player ids are public in `/players`. The receiver auto-plays every memo
  while the tab is visible, from strangers too, not only from the chosen bestie. This is a harassment vector.
- `v.data` and `v.mime` are not type-checked or size-checked. The test fed `data: {object}` and `mime: 'text/html'`,
  and the client tried to play it. It is harmless in an `<audio>` data URL, but sloppy.
- With open read rules, `GET /walkie.json` downloads every stored voice clip. Clips for players who are offline stay
  forever. Real players' recorded voices are therefore public.
- Fix (main.js, in `child_added`):
  ```js
  const ok = (x) => typeof x === 'string' && /^[-_A-Za-z0-9]{8,40}$/.test(x);
  const data = typeof v.data === 'string' && v.data.length <= 400000 && /^[A-Za-z0-9+/=]+$/.test(v.data) ? v.data : null;
  const mime = typeof v.mime === 'string' && /^audio\/(webm|mp4|ogg|mpeg|aac)(;\s*codecs=[\w.]+)?$/i.test(v.mime) ? v.mime : 'audio/webm';
  if (!ok(v.from) || !data || v.from !== this.bestieId) { snap.ref.remove().catch(() => {}); return; } // bestie-only, as the UI promises
  const memo = { key: snap.key, from: v.from, fromName: cleanText(v.fromName, 16) || 'someone', data, mime };
  ```
  Also add `this.walkieRef.onDisconnect().remove()`, so our inbox does not keep clips after we leave.
- Fix (net.js `sendWalkie`): add `if (typeof targetId !== 'string' || !/^[-_A-Za-z0-9]{8,40}$/.test(targetId) || typeof base64Data !== 'string' || base64Data.length > 400000) return;`,
  a 2 s rate limit like `realmRateAt`, and `fromName: cleanText(this.name, MAX_NAME_LEN)`. It currently sends the raw
  `this.name`.
- The README should say plainly that walkie clips are readable by anyone until they are played.

### P1-3 Presence and blocks floods: no client-side cap (main.js registerNetHandlers, net.js startListening)
- `MAX_PLAYERS` is enforced only by the join transaction of well-behaved clients. A hostile client can write any
  number of `/players` records, and every client draws all of them. Measured offline (net-hostile-presence): 300 fake
  records gave 309 sprites plus 309 name texts plus 300 `renderPlayerList()` rebuilds. The frame rate dropped to about
  11-15 fps in headless Chromium. Thousands of records would freeze the Town.
  `/blocks` is read with an unbounded `child_added`, so it has the same problem.
- Fix (main.js): `const REMOTE_CAP = 30;` and in `playerJoined` and in the add branch of `playerUpdated`:
  `if (!this.remotePlayers.has(p.id) && this.remotePlayers.size >= REMOTE_CAP) return;`. Coalesce
  `renderPlayerList()` (set a dirty flag, then render at most once per 250 ms).
- Fix (net.js): `this.blocksRef.limitToLast(1500).on('child_added', ...)`. In main.js `addBlockVisual`, ignore new
  blocks past 1500.
- Optional (net.js): `this.playersRef.orderByChild('t').limitToLast(40)` (rules need `".indexOn": ["t"]` under
  `players`).

### P1-4 One write locks the whole town out (`playerCount` counter)
- Anyone can set `/playerCount` to 10 or more, and then every honest join hits "Town is full" until someone fixes the
  node by hand. Setting it to 0 bypasses the cap. Stale counts also happen naturally when an `onDisconnect`
  decrement is lost.
- Fix (net.js `join` / `rejoin`): when the transaction does not commit, read `players` once. If
  `snap.numChildren() < MAX_PLAYERS`, run a second transaction that returns `Math.max(actual, 0) + 1` (a self-heal
  that writes only the counter, which the client already writes), and continue the join. Show 'townFull' only when
  the real child count is at the cap. The rules draft already caps the counter at 0..100.

### P2-1 Realm invite spam (main.js showRealmInvite)
- The 1.5 s rate limit lives only in the sender's client. A hostile client can push endless invites to any id. Each
  one reopens the toast, closes the nav sheet and rewrites `document.title`. Invites from ids that are not in town are
  accepted too.
- Fix: in `showRealmInvite`, `if (!this.allPlayers.has(inv.from)) return;`. Add a per-sender cooldown
  (`this._inviteSeen[inv.from]` within 10 s, then ignore), and ignore a new invite while one is showing.
- Receive-side cleaning is good. The party id regex rejects `../../players` (tested), and rtCleanSnap / rtCleanInput
  clamp everything.

### P2-2 Shared nodes anyone can grief (open rules, no auth): documented, not fixable client-side
- `realmCancel(party)` and `removeBlock(key)` work on any key, and a client can overwrite any `realmParties/*/h`.
  Chat, guestbook, scavenger and tournament nodes are never pruned: reads are bounded, but storage grows.
- Recommendation: Firebase Anonymous Auth plus `auth.uid` ownership rules is the only real fix. Until then, an owner
  task can prune nodes older than 7 days.

### P2-3 Test runner: live tests are flock-protected only on request (tests/run-all.js)
- `hasFlock` is true only with `--lock-live`. A plain `node game/tests/run-all.js` runs live-class tests without
  `/tmp/live.lock`, which the brief requires.
- Fix: `const hasFlock = !argv.includes('--no-lock-live') && spawnSync('flock', ['--version'], { stdio: 'ignore' }).status === 0;`.
- `town-perf.test.js` and `realm-playthrough.test.js` say the DB host "never answers", but they block HTTP only, so
  their ADMIN bots do join the live town. Add `await ctx.routeWebSocket(BLOCK, (ws) => ws.close());` and join through
  'Play offline' (the nav-town pattern) if live presence is not what they test. `town-links.test.js`'s join-screen
  contexts open an unblocked read-only socket (watchOnlineCount); give them `blockDb(ctx)`.

### P2-4 No CSP and no framing protection (index.html and every game page)
- No `Content-Security-Policy` anywhere. Hosting cannot set headers, so add a meta CSP to `game/index.html`:
  `default-src 'self'; script-src 'self' https://cdn.jsdelivr.net https://www.gstatic.com; connect-src 'self' https://*.firebaseio.com wss://*.firebaseio.com; img-src 'self' data: blob:; media-src data: blob:; style-src 'self' 'unsafe-inline'; frame-src 'self'; object-src 'none'; base-uri 'self'`.
  Check that every inline `<script>` is moved out first, or add hashes.
- Clickjacking: `frame-ancestors` cannot be set by meta. The impact is low, because no one-click destructive action
  exists (chat needs typing). Optional frame-buster for the Town page only:
  `try { void top.location.href; } catch (e) { document.body.hidden = true; }` (reading a cross-origin top throws; the
  same-origin Realm iframe is unaffected).

### P2-5 Small hardening items
- net.js `sanitizePlayer` / `cleanClaim` spread unknown fields through (`...v`). Nothing reads them today. Drop
  `...v` or cap the record (`JSON.stringify(v).length > 4096`, then skip it) so a 10 MB record is not held in memory.
- net.js `claimScavengerSpot` / `submitTournamentCatch` write the raw `this.name`. Use `cleanText(this.name, MAX_NAME_LEN)`
  like chat does.
- `?legacyart=1` only: `safeTexture` accepts any loaded texture key as a remote species, so a remote player can appear
  as a tileset. This is cosmetic. Fix: accept only keys in `SPECIES`/`RARE_SPECIES`.
- `games/jam/jam.js`: `?seed=` has no length cap before it is hashed (local only). Fix: `/^[A-Za-z0-9_-]{1,24}$/` like
  pop, dash, stack and echo.

## Verified OK (no change needed)
- Write paths in net.js: presence (own node, transaction, onDisconnect), counter, chat (cleanText 140, 5 per 10 s client
  burst), guestbook (80, cooldown), blocks, scavenger and tournament (CAS transactions), walkie (see P1-2), realm
  invites and parties (regex ids, size cap 24000/2500, 60/40 ms rate). No other file in the repo writes to Firebase.
  `main.js` touches it only through net.js, plus the walkie inbox listener and `goOffline()`.
  `tools/activity-snapshot.js` is read-only. `mm-board.js` posts only if a fetch and URL are injected (none are).
- The new hero species keys (`hero_<class>`) go through the existing species field, at most 16 characters (the draft
  allows 24). `MMTownHeroes.resolve` maps any junk to a real hero texture (tested). The new shared modules add no new
  write path: `mm-settings`, `mm-feedback` (localStorage plus Copy/Download only), `mm-minikit` (clipboard only),
  `mm-nav`, `mm-town-heroes` and the hub.
- Untrusted text reaches the DOM through textContent everywhere for remote names, chat, guestbook, invites, titles,
  partner names and the realm banner. The innerHTML uses (realm.js shop and backpack, museum, changelog, dungeon
  summary, recap) take static tables, numbers, `escapeHtml`, or saves cleaned by `rmCleanSave`.
- URL params: `?from=` is exact-match only (`'hub'`, `'isles'`, `'realm'`). `?seed=` is regex-validated (pop, dash,
  stack, echo, isles, deepdelve, mad-maze). `?return=` uses a strict `RETURN_RE`. `?map=1` and `?test=1` are boolean
  flags. The `close-realm` postMessage is origin-checked. Menu "Continue" (`pixeltown-nav-v1`) goes through
  `MMNav.cleanUrl`, a registry allow-list of repo-relative files plus the safe keys isle, seed, from and test
  (`javascript:` and `//evil` are rejected, covered by shared-mm-nav.test.js).
- Tests: all non-live Town tests use blockDb or route + routeWebSocket. All live bots are ADMIN* (after the fix above),
  and none chat. The realm-team, duel and 2v2 live tests write realmInvites/realmParties only between their own two
  ADMIN pages and clean up.
- Secrets at HEAD: the only key is the Firebase web `apiKey` in `firebase-config.js`, which is public by design.
  Recommended: an HTTP-referrer restriction on it in the Google Cloud console. No tokens, private keys, .env files or
  personal emails in tracked files. A personal author address exists only in git commit metadata.
