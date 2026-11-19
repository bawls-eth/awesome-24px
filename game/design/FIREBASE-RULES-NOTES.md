# Firebase rules draft: notes for the owner

`game/firebase-rules.draft.json` is a DRAFT of Realtime Database rules. Nothing applies it automatically.
It adds `.validate` constraints only; `.read` and `.write` stay `true` because the game has no sign-in and
every client must read and write the paths below to keep working.

## How to apply (owner only)
1. Firebase console > Realtime Database > Rules.
2. Copy the whole file content into the editor, replacing the current rules. Click Publish.
3. Keep the old rules text somewhere so you can paste it back if the game breaks.

## What it protects
- Every path the game writes has a shape: required children, allowed keys only (`$other` is `false`),
  string length caps, numeric ranges, enum values (`mode`, `k`), and id formats (8-40 chars of `A-Za-z0-9_-`).
- Unknown top-level paths are rejected, so nobody can park data in new places.
- Chat text, guestbook notes, names, walkie clips (200 KB), seat messages and snapshot arrays are size-capped.
  A 30 KB message on a party seat is refused.
- Party seats are `g1`..`g3` only, plus `m` and `h`; a `g4` or a stray key is refused.
- Covered paths: players, playerCount, chat, guestbook, blocks, scavenger, tournament, walkie,
  realmInvites/{target}/{push}, realmParties/{party}/{m,h,g1,g2,g3}.

## What it cannot do
- No auth means no identity. Anyone can still write any seat, send invites as anyone, or overwrite another
  player's node with a valid-looking record. Validation limits damage, it does not stop impersonation.
- It cannot rate-limit; spam of valid chat is still possible.
- Rules cannot measure the total byte size of a snapshot. Arrays are capped per field only, so a determined
  client can still send a snapshot a few KB over what the host would. The client keeps its own 24 KB cap.
- Reads are public (`.read: true`), as before.
- Real fix for identity: Firebase Anonymous Auth plus `auth.uid` rules (a later slice).

## Risks to check before publishing
- The `x`/`y` ranges (player world, arena) and `ev.k/d/o` types are inferred from code, not measured. If a
  legitimate write is rejected, loosen that field.
- A write that fails validation fails silently in the game (`.catch(() => {})`), so test every feature.

## Testing
- Offline: `node game/tests/shared-rules-draft.test.js` (uses `game/shared/rules-check.js`, a small subset
  evaluator: `isString`, `.val()`, `.length`, `.matches`, `hasChildren`, `$other`).
- Rules Playground (Rules tab > Rules Playground): pick Simulate type "set", location e.g. `/players/abc123def456`,
  data a JSON record, leave Authenticated off, and click Run. Try a valid record (should be allowed), then add
  an extra key or a 200 character name (should be denied with the failing `.validate` line).
- Test party writes at `/realmParties/-NpartyKey12345/g1` with a seat message, and `/secrets/x` (denied).
- Finally play with two browsers: join, chat, place a block, invite, start co-op and 2v2.
