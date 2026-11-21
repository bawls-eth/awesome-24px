# Review: gear save / merge / economy changes since c899a2a

Read-only review (no code changed). Scope: `realm.js` (rmCleanSave, rmMergeSave, _calcStats/_affixInto, forge, collectItem, sets),
`games/mad-maze/realm-world.js`, `dungeon.js`, `shared/mm-gear*.js`, `mm-stash.js`, `mm-backup.js`, `mm-profile.js`, `lantern.js`.

How the findings were checked: realm.js and the shared modules loaded in a Node `vm` sandbox with the exact `_persist` / `resyncSave`
bookkeeping copied from RealmArena. Two findings (F1, F2) were also reproduced in Chromium against the local server
(`?test=1&offline=1`, WebSockets closed, localStorage only, no DB).

Severity: **P0** data loss or crash, **P1** exploit or duplication, **P2** bug or risk.

| # | Sev | Summary |
|---|-----|---------|
| F1 | P0 | A failed save write (quota) deletes the item you just picked up on the next successful write |
| F2 | P1 | Every dungeon gear drop also leaves a T0 duplicate in the pack, and the stash records the copy without its tier |
| F3 | P0 | An old tab (built before GW) erases `dust`, `f` (paid reforges) and `sig`, and the new merge accepts the erase |
| F4 | P1 | Combine changes `r` in place, so a stale merge duplicates an item (one tab: the Town arena starts from a load-time copy of the save) |
| F5 | P1 | The forge ignores `sig`: on 60% of T12 signature weapons it offers an affix the item already has, so the affix stacks |
| F6-F17 | P2 | Power cap bypass, merge truncation, co-op loot tier, false "old tab" hint, pity spent on a full pack, and others (see below) |

Town page (classic arena in `game/index.html`, realm.js with no gear modules): I found no crash path. Every `MMGear*` call there sits
behind `RM_GEAR_ON` / `forgeOn()` / `typeof` checks or a try. `RM_ITEM_BY_ID` is `Object.create(null)`. `__proto__`, `constructor` and
`toString` ids are dropped, `f.id = '__proto__'` is dropped, and NaN or `1e400` counters clean to 0.

---

## F1 (P0): a failed save write deletes freshly picked items

- **Where:** `realm.js:449-453` (`_persist`). Writes that swallow errors: `games/mad-maze/mad-maze.js:25-26` and `main.js:158-163`.
- **Why:** `_persist` sets `this._known = this.save.items` and the `_base*` values *before* the write, and assumes the write worked.
  When `localStorage.setItem` throws (quota full, Safari private mode, blocked storage), storage still holds the old list, but `_known`
  now contains the new uid. On the next successful persist, `rmMergeSave` reads "known to this tab but missing from storage" as "another
  tab sold it" and drops the item from memory *and* storage.
- **Repro (Chromium, real arena):** make `setItem('pixeltown-save-v1')` throw once, call `collectItem('sparkwand', 3)`, restore
  `setItem`, gain 1 shard, call `onSave`. Result: `afterPick: 1`, then `mem: []`, `stored: []`. The item is gone from memory and storage.
  (The MMStash pending find for it survives, so the Lantern still pays a copy.)
- **Why it matters now:** `MMBackup.snapshotPregear` (F14) writes a permanent full copy of every known key, which roughly doubles how much
  localStorage the game uses. Storage-full errors become far more likely, and the T11-12 items that would be lost are the hardest to replace.
- **Fix (minimal):** in `_persist`, after `this._onSave(this.save)`, set the bookkeeping from what storage actually holds:
  `const st = rmCleanSave(rmReadStoredRealm()); this._known = new Set(st.items.map((it) => it.n)); this._baseShards = st.shards; this._baseDust = st.dust || 0; this._baseGp = rmGpOf(st.gp);`
  A failed write then leaves the item "new here" and it is written next time. Optionally also make both `writeSave` functions return a
  boolean and show a "storage full" toast.

## F2 (P1): every dungeon gear drop also leaves a T0 duplicate

- **Where:** `games/mad-maze/dungeon.js:505-507` (`gearGrant`) and `realm.js:3115-3127` (`collectItem`).
- **Why:** `collectItem(g.id, g.r)` pushes `{n, id, r}` and calls `onSave` *before* `t`, `a` and `sig` are set, so storage receives a
  T0 entry with uid N. `gearGrant` then changes the same entry (`it.t = g.t`) and calls `onSave` again. The merge now compares memory
  (N with t) against storage (N without t). Item identity is `(n, id, r, t, a)`, so it treats them as a uid collision: memory's copy
  gets a fresh uid and storage's T0 copy is kept.
- **Repro (Chromium, real arena):** run the gearGrant sequence (`collectItem('sparkwand', 1)`, then `it.t = 9; it.a = 12345;`, then
  `onSave`). Result: `[{n:2, sparkwand r1 t9 a12345}, {n:1, sparkwand r1}]`. One drop gives two items.
- **Side effects:**
  - `dungeon.js:282`: `onItem` (`MMStash.recordTo`) runs inside `collectItem`, before the tier is set. The stash pending find is the
    T0 copy (`{n:1, id, r}`, no `t`), so the soulbound check in `MMStash.payout` never sees T11+. Crypt boss T11 drops are copied to the
    Lantern stash, breaking the soulbound rule.
  - The T0 copies can be sold for shards or used as combine fodder: a free faucet. The gear tests check only items *with* `t`, so
    nothing catches this (`tests/gear-dungeon-drops.test.js:52`).
- **Fix:** set the tier before the item is recorded or saved, the same way realm-world.js already does (`realm-world.js:967-983`).
  Either give `collectItem` an optional 3rd argument `gear` (`{t, a, sig}`) and build the entry with it before `onItem` and `onSave`,
  or wrap `arena.onItem` for this one call so it adds `t`, `a` and `sig` to `it` before the stash record. Add a test that counts
  *all* pack items after one boss kill.

## F3 (P0): old tabs erase `dust`, `f` and `sig`, and the new merge accepts it

- **Where:** `realm.js:192-207`, `:295-296`, `:311` (kept fields) and `realm.js:366` (dust three-way merge).
- **Why:** `sig`, `f` and `dust` started being *created* in the same commit that taught rmCleanSave to *keep* them (7380f36). No earlier
  build has them in its cleaner (checked 2451f5b, 64eb122, 90458ea and 6a71398: no `out.dust`, no `rmCleanForged`, no `rmCleanSig`).
  The G7 rule in the realm.js:165 comment ("ships one deploy before any drop creates them") was not followed for GW. The Town page is a
  long-lived multiplayer tab, so an old Town tab whose classic Realm gate persists once will rewrite the realm save without these fields.
  The next new tab then treats the missing dust as "the other tab spent it": `bd = 0`, so `out.dust = 0 + (ad - baseDust) = 0`.
- **Repro (node, old `rmMergeSave` from 2451f5b against a save with `dust: 120` and a forged T12 `sig: 'blast'` item):** the old tab's
  write and the new tab's reload both come back with no `dust`, no `f` and no `sig`. The dust, and the dust plus shards paid for the
  reforge, are gone. The GH downgrade hint (`realm-world.js:986-1006`) only notices missing `t`, so it says nothing.
- **Fix:**
  1. Keep the forge out of old builds' reach. Store the forge data in its own key that no old build ever writes, for example
     `pixeltown-forge-v1 = { dust, x: { <uid>: { f, sig } } }`, with `realm.dust`, `item.f` and `item.sig` kept only as mirrors. Read
     back with max(mirror, key) for dust, using the same three-way rule.
  2. Or, as the cheaper route: gate `forgeOn()` and the `sig` writing behind a flag for one deploy after the keep-only code ships (the
     G7 pattern), and extend the downgrade hint so it also remembers `dust > 0` and the count of items with `f`.

## F4 (P1): combine changes `r` in place, so a stale merge duplicates the item

- **Where:** `realm.js:3795` (`c.keep.r += 1`), stale source `main.js:2352` together with `main.js:3098`.
- **Why:** `rmMergeSave` identity includes `r`. A tab still holding the pre-combine state sees survivor uid 5 as `r1` while storage has
  `r2`. It keeps its own `r1` copy under a fresh uid, keeps storage's `r2`, and drops the two consumed uids because they are known.
  Net effect: 3 x r1 becomes 1 x r2 plus 1 x r1. Reforge already avoids this by using a fresh uid (`realm.js:3848-3866`); combine does not.
- **Single-tab repro (no race needed):** load the Town page. `this.realmSave` is captured once at scene create (`main.js:2352`). Open
  Mad Maze from the Realm gate menu (embed), combine three identical T9 items, then close it (`closeRealmEmbed` refreshes
  `this.save.realm` but not `this.realmSave`). Enter the classic Realm gate: `new RealmArena({ save: this.realmSave })` starts from the
  stale copy, and its first kill persists and duplicates the item. You can repeat this on every Town reload.
  Node: `rmMergeSave(stale, afterCombine, {known: {5, 6, 7}})` gives `[{n:8, r1, t9}, {n:5, r2, t9}]`.
- **Fix:**
  1. In `combine`, replace the survivor with a fresh-uid entry (`{...keep, n: sv.nextUid++, r: keep.r + 1}`) and update `eq`, as
     `reforge` does.
  2. Separately, in `main.js:3096-3100`, construct the arena with `save: loadSave().realm`, and call `this.realm.resyncSave()` at the
     start of `enterRealm`. A `pageshow` (persisted) or `visibilitychange` resync in realm.js also covers bfcache and frozen tabs.

## F5 (P1): the forge ignores `sig` and offers affixes the item already has

- **Where:** `shared/mm-gear-forge.js:22` (`view` drops `sig`) and `:61` (`roll(..., c.a, null)`); validation also at `realm.js:779`.
- **Why:** `MMGearAffix.roll` removes the signature from the pick pool *before* the seeded picks (`mm-gear-affix.js:80-83`). A roll
  with `sig = null` therefore picks *different* affixes from the real ones. `reforgeOptions` then shows the wrong "already rolled" list,
  and realm only filters out the signature id itself (`realm.js:3846`).
- **Measured:** T12 `sparkwand` weapons, a = 1..3000, each of the 4 weapon signatures: the forge offers an affix the item already has
  in **7249 / 12000** cases (for example a=1, sig `leech`: the item rolls venom, keen and leech, and the forge offers venom). Forging it
  stacks a second venom. `_affixInto` sums both (`MMGearAffix.sum`), and `_forgedOf` accepts it because it validates through the same
  roll with no signature.
- **Fix:** pass the signature through. In `view` add `sig: has(item, 'sig') ? item.sig : undefined` to the `MMGear.clean` call, and in
  `reforgeOptions` use `MMGearAffix.roll(c.id, slot, c.t, c.r, c.a, c.sig || null)`. realm's `_forgeView` should include `it.sig`, and
  `_forgedOf` should pass `sig: it.sig`. Add a unit test that checks forge options never intersect `roll(..., sig)`.

---

## P2 findings

**F6: a forged affix bypasses the weapon power cap.** `realm.js:838` appends `f` after `MMGearAffix.roll`, which already applied the
cap. Measured: T12 r3, a=42 (venom 0.12, swift 0.06) plus forged keen gives a power product of **1.2146** against a cap of 1.14. This
breaks the "every bonus stays inside the cap" invariant that MMGearSets enforces. Fix: in `MMGearForge.reforgeOptions`, trim `v` so
`value(rolled + forged) <= cap(t)` (reuse the `sigBoost` bisection), or apply the cap when summing in `_affixInto`.

**F7: after a resync without a write, the shard and dust base is wrong.** `realm.js:445` sets `_baseShards` and `_baseDust` to the
*merged* value instead of the *stored* value (`_baseGp` and `_known` correctly use stored). Any delta that is still only in memory when
a storage event arrives is lost on the next persist. Node: A +40 shards / +30 dust unsaved, B writes, A resyncs and persists: expected
145/80, got 105/50. The shard part predates this range; the dust part is new. It is latent because every gain calls `onSave` in the
same task. Fix: `const st = rmCleanSave(stored); this._baseShards = st.shards; this._baseDust = st.dust || 0;`.

**F8: the merge truncates at 24 and drops storage-only items, T12s included.** `realm.js:333-369` builds `mine ++ storage-new`, and the
final `rmCleanSave` keeps the first 24. Node: A holds 22 + 2 classic wands, storage holds the same 22 + 2 T12s picked by B, and the
merge keeps 24 items with **0** T12s. It needs a stale merge, which F4's paths provide. Fix: let the merge exceed `RM_BACKPACK` (only
pickup enforces the limit), or put tiered and storage-new items first before capping.

**F9: co-op `loot` hands over tiered weapons as T0 and leaves stale gear on the bag.** `realm.js:3144` refuses `arm_` items but not
`b.gear`. The partner receives `[id, r]`, so a T12 arrives as a classic item, and `b.gear` stays on the now-inactive pooled bag.
realm-world's `onItem` matcher (`realm-world.js:972`) can later attach that gear to the host's next same-id/r pickup within 30 px.
Net: one extra item. Fix: add `&& !b.gear` to the partner pickup condition, and set `b.gear = null` whenever a bag goes inactive.

**F10: the downgrade hint fires after a legitimate salvage.** `realm-world.js:994-1005` updates the remembered count only while a
tiered item exists. Salvage or sell your last tiered item, and on the next visit `gv:1` plus no `t` plus fewer items shows "Your gear
may have been reset by an old tab: restore from Lantern backup". That invites a destructive restore of an old file. Fix: in
`gearHintNote`, when no tiered item remains and the hint was not just shown, write `{n: sv.items.length}` (or 0).

**F11: a full pack sells gear at classic value, after the pity was spent.** `realm.js:3118-3120` sells for `RM_RARITIES[r].sell`, not
`rmSellValue`, and skips `onItem`, so `t` is never known. World pity resets when the T12 is *rolled* (`realm-world.js:684`), so a
pity-forced T12 can turn into 3-30 shards. Dungeon `gearGrant` has the same problem (`sold: full`). Fix: pass the tier into
`collectItem` (see F2) and sell with `rmSellValue({r, t})`, or refuse the pickup and keep the bag while the pack is full.

**F12: world pity is read from a stale in-memory save, so multi-tab doubles the guarantee.** The world uses `save.gp` from
`readSave()` at create time (`realm-world.js:646`, `:684`), and `writeSave(save)` is last-writer-wins. Two world tabs at `b = 60` each
get a forced T12. Fix: re-read `readSave().gp` right before a z3 boss `rollGear` / `pityStep`.

**F13: reforging before a settle forfeits the stash copy.** Reforge gives a new uid, so `MMStash.payout` (`mm-stash.js:85`) counts the
pending find as "thrown away". Fix: when reforging, rewrite the pending find's `n` (`MMStash.readFinds` / `writeFinds`) or record the
new uid.

**F14: the pregear snapshot costs quota and has no restore path.** `mm-backup.js:212-223` stores a full bundle (with no `MAX_TOTAL`
check) under a key no UI or code ever reads (`grep PREGEAR_KEY` hits only mm-backup.js). It is dead weight that feeds F1. Fix: offer
it in the Lantern restore (plan/apply it with a confirm), skip it when the bundle is over ~1 MB, and delete it once a normal backup
download has happened.

**F15: the URL kill switch is parsed three different ways.** `dungeon.js:10` uses `URLSearchParams.get('gear')` (first value, decoded),
`realm.js:111` matches `gear=0` anywhere, and `realm-world.js:632` takes the first `gear=\d`. With `?gear=1&gear=0`, realm.js turns
effects off while dungeon and world still roll and write tiered items. With `?gear=%30`, dungeon is off while realm.js is on. Fix: one
helper (realm.js `rmFlagOff('gear')`) used by all three.

**F16: persist cost per kill.** Every kill calls `onSave`, which runs `JSON.parse` of the whole town save (in `rmReadStoredRealm`),
three `rmCleanSave` passes, two `JSON.stringify` calls in `_adopt`, and `writeSave` (parse plus stringify again). G11 splash can kill
several enemies in one frame, which multiplies this into frame hitches on a large town save. Fix: mark the save dirty and persist at
most once per frame (or every 250 ms), with a flush on exit, death, menu and `visibilitychange`.

**F17 (minor): `importLegacy` copies soulbound items.** `mm-profile.js:121` copies T11+ items into the Legacy Ranger pack, the one path
that skips the soulbound rule `MMStash` enforces. Fix: skip `t >= 11` there (or keep them, but note it in the Lantern text).

## Checked and found fine

- Salvage, reforge, vendor and buy-back arbitrage. Salvage gives `1 + t(1 + r)` (T12 r3 = 49). A T12 r3 reforge costs 150 dust + 6
  shards. Vendor T1-T3 costs 20-36 dust while buy-back or salvage returns 2-18. Combine-then-salvage loses dust. `vendorStock` and
  `buyBack` are not wired into realm.js yet.
- Deposit and withdraw in `lantern.js` / `MMStash.deposit` move items (splice) and refuse soulbound. The realm-to-stash payout is a
  copy by design, and nothing writes stash items back into the realm save.
- The `?gear=0` effects path: `_calcStats`, `_affixHtml`, `_setsOf`, `forgeOn`, `rmSellValue`, `_resistFor` and splash are all gated on
  `RM_GEAR_ON`. Duels return identical stats.
- Pity three-way merge (`realm.js:367-368`). Uid remap on collision keeps `t` / `a` and updates `eq`. `MMGear.clean` / `rmCleanSig` /
  `rmCleanForged` reject hostile values.
- Randomness: gear rolls are seeded per player (`seedFor`, `'p' + seat`), and dungeon gear uses its own `dgear*` streams. The only
  `Math.random` is the first-visit island seed (per device, not shared).
