# Bug bash: shared modules (lane bb-shared)

Tests: `game/tests/shared-bugbash-fuzz.test.js` (node, 85 checks) and `game/tests/shared-bugbash-browser.test.js` (browser).

## Fixed (with tests)

| Module | Bug | Severity |
| --- | --- | --- |
| store.js | After a failed write (quota exceeded, private mode), `get` returned the old stored value instead of the newest one held in memory | high |
| rng.js | `hash(number)` hashed as `''`, so every number collided; `hash(null)` threw | medium |
| rng.js | `int(hi, lo)` returned values outside the range (and never `lo`); NaN bounds gave NaN; `pick(null)` / `shuffle(null)` threw. Still exactly one `next()` per call | medium |
| mm-hash.js | An insert or query with an Infinity position or radius, or a huge radius, hung the frame in an endless cell loop | high |
| mm-minikit.js | Share codes dropped `-`, `_` and upper case, so Replay from a code started a different board. Codes now keep `-` and `_`, and upper case is written as `.` + letter. Old A-Z0-9 codes read as before | high |
| mm-minikit.js | `result()` threw on a null entry in stats, lines, more or headline | low |
| mm-input.js | `actionOf('constructor')` and `'__proto__'` returned Object.prototype members as actions | low |
| mm-input.js | `attach()` read Ctrl/Cmd/Alt chords. On macOS the key's keyup never comes while Cmd is down, so the action stayed held | medium |
| mm-input.js | `readPad`: an axis reporting Infinity gave NaN movement; an `out` object without `.move` threw. Arrows, Enter and Escape now also have a code fallback | low |
| mm-chip.js | `resolve('toString')` and similar names resolved; a hand-made cue object with huge bars, loops or bpm could hang; after a long hidden tab the sequencer rendered every missed pass | low |
| sfx.js | A rejected `resume()` (autoplay blocked) was an unhandled rejection | low |
| sfx.js | Sounds asked for outside a gesture while the context was suspended were queued, then all played at once on the first tap | medium |
| sfx.js | Loading sfx.js twice on a page injected mm-chip.js twice | low |
| mm-8bit.js | `col(NaN)` returned undefined; `crispScale(0)` returned Infinity (CSS width "Infinitypx"); particles with no rng used Math.random (they now use a seeded LCG) | low |
| mm-pixelize.js | `size` NaN gave a 0-byte image and Infinity threw a RangeError; a null or short buffer threw; a `__proto__` key in the options could re-parent the merged options | low |
| mm-ghost.js | `decode` accepted junk such as `1x!` or a negative time, because `parseInt` is lenient | low |
| mm-art.js | `load()` threw synchronously when `fetch` was missing, although it promises never to reject | low |
| mm-backup.js | (saves S3, P0) The Backup export left out 21 progress keys: Deepdelve, the arcade bests and medals, Bugs goals and PB, Jam assist, Stalk practice, Angler fun and the active hero. They are now exported (additive, VERSION stays 2) | high |
| profile.js:84 | (saves S4) `profile.games` was kept unbounded, so a 5 MB value made every later save hit the quota. Only that one line changed (hub lane file) | medium |
| motion.js | `shake(Infinity)` returned Infinity px; `lowHpBorder(NaN hp)` showed the low-HP warning | low |

Checked and found clean: every MMChip cue track has exactly bars*8 valid tokens; every rendered note, including the seeded variation, is within MIDI 24..108; every SFX note and slide end is in range; every alias exists; same seed gives the same events. The MMInput key map matches CONTROLS.md and the hint text matches its example. No shared module of this lane hung in a hostile-argument sweep of every exported function. MMMiniKit.panel() called 6 times adds one key listener. There is no AudioContext before a gesture.

## Open (not fixed)

1. **Math.random fallbacks when the caller passes no rng.** Seen in mm-classes.js:113, mm-items.js:142, mm-party.js:18, mm-pets.js:22 and mm-angler.js:275. Swapping in a seeded default could change live behaviour for callers that rely on it, so they were left alone. Fix: audit the callers, then default to `MMRng.create(<context seed>)`. Severity: low.
2. **Clock fallbacks when the caller passes no date.** `new Date()` / `Date.now()` in mm-daily.js:14, mm-stalk-market.js:52/58, mm-stalk.js:56, mm-backup.js:242 and rules-check.js:68. These are clock defaults by design. Severity: low.
3. **Raw mixed-case seeds with `-` or `_` are now lower-cased.** A hand-typed `?seed=My-Run` used to fall through to the raw seed. It now parses as a share code and becomes `my-run`. Generated seeds are lower-case base36 and are not affected. Severity: low.
4. **Missing required arguments throw.** Many pure helpers throw a TypeError when called with no arguments (for example `MMParty.join()`, `MMOverworld.tileAt()`, `MMStash.payout()`). This is API misuse, not a player-reachable bug, so it was left as is.
5. **`MM8.particles().burst()` reads localStorage on every burst.** It parses MMAccess prefs each time through `lowGfx()`. Cheap, but it could be cached per frame. Severity: low.

## Elsewhere

- The save-hostile-fuzz backup line still reports 2 keys as KNOWN: `pixeltown-backup-pregear-v1` and `arcane-frontier-save-v1`. Both are marked n/a in SAVE-KEYS.md: the first is itself a backup, the second belongs to a separate prototype. The test's progress filter could skip n/a rows (saves lane file).


