# Cycle 13: S (Game Systems)

Branch `cyc13-systems` (cut from `1e6b3b6`). Static server on port 9135. All browser runs went through `/tmp/bt.sh`. Nothing was pushed.

## 1. ID-59: first-visit animal hello (approved with conditions, U cycle 11)
**What changed** (`game/main.js`, `game/style.css`):
- **When it fires.** A few times a second (`updateAnimalHello`, called from `update`), the game looks for the nearest wild fauna specimen within 160 px of the hero whose species has not been greeted yet. This only happens in the Town: not in the Realm, underground or the Realm embed.
- **What the player sees.**
  - The animal turns toward the hero, but only for strip species (side and down frames) that are standing still. A walking animal's tween owns its frame, so it does not turn.
  - A heart appears above the animal for 1.2 s and follows it.
  - With reduced motion (the Town toggle, the OS setting, or flashes-off / low-gfx through `a11y-reduce-motion`) the heart has no hop and no fade.
- **Placeholder heart.** The heart is one function, `makeAnimalHelloHeart(scene, x, y)`. It returns a code-drawn 7 x 6 pixel heart (original, drawn at 3x). G's heart emote from `cyc13-art` replaces only this function's body. The function must return a display object with its origin at the bottom centre.
- **The line.** "A Red Fox noticed you 💛" (or "An …"), using the species name from `FF_ASSETS`. Villagers are never greeted. It goes in `#achievement-toast` (aria-live polite) for 4 s, and only when all of these hold:
  - the toast is free;
  - What's-new, the welcome-back line and the Realm Gate chip are all down;
  - the first-minute quiet is over;
  - no line has shown in the last 30 s;
  - `canAct()` is true (no panel, shop, Museum, map, nav sheet or settings open);
  - the bag is not expanded and build mode is off.

  Otherwise the line is skipped and only the heart shows.
- **Narrow screens (<= 300 px).** The toast at y 70 covered the bag bar, which starts at y 124. The hello line gets a compact full-width layout at y 64 (class `toast-hello`). `showAchievementToast` and `stallNote` remove that class, so other toasts look as before.
- **Save.** One additive Town-save key, `animalHello`. It is an array of 30-bit integer words, a bitmask over the fauna order of `FF_ASSETS`.
  - **This differs from the spec's "integer".** There are 57 fauna, and a JS number cannot hold 57 bits exactly.
  - The key is only written once a hello happens. It is written through `writeSaveMerged` as an OR with what storage holds, so it is never lowered and another tab's bits are kept. Unknown bits and words are kept.
  - `cleanAnimalHello` turns a non-array into `[]` and a bad word into 0.
  - If storage refuses the write, the bits stay in memory and the next hello carries them.
  - Documented in `design/SAVE-KEYS.md` (town save row).

**Test:** new `game/tests/cyc13-s-animal-hello.test.js` (browser/full, 420 s, registered). It covers 1280x720, 390x844 and 195x422:
- heart above the fox, in the camera view;
- the exact line text, inside the screen, covering none of A / C / bag bar / joystick, no sideways scroll;
- save bit added, other bits and the unknown word kept, other seeded fields unchanged;
- heart gone after 1.2 s;
- second species within 30 s: heart, no second line;
- the compact class is dropped by the other toast writers;
- after a reload, fox and deer are not greeted again;
- reduced motion: static heart, still removed;
- Museum open: heart, no line;
- normal motion: the heart bobs;
- new player with the gate chip: heart, no line, chip stays;
- 0 DB attempts.

| Check | Result |
|---|---|
| Hello test on base code (`main.js` and `style.css` from HEAD, run against port 9135) | **18 FAILED** |
| Hello test on the branch | ALL PASSED. The first run failed 1 check at 195x422 (toast over the bag bar), which led to the compact layout. Then 2 timing failures under load 3.5x, fixed by making the test wait for the greeting (up to 3 s) instead of using a fixed 400 ms. Then the final code passed twice in a row. |
| `town-first-ten` | First run FAILED 1 check: on the phone the gate chip was hidden because a spawn hello took the toast. I fixed the code: the line now waits for the gate chip and the first-minute quiet. After that: ALL PASSED. |
| `cyc12-s-welcome-back`, `cyc3-ui-town-first-visit`, `town-hint-lookups`, `beta-r4-d4-town`, `cyc4-ui-town-zoom-goal`, `cyc8-ui`, `save-compat-pages` | ALL PASSED. The last 4 ran after the gate-chip fix; the first 3 ran before it (that fix only skips the line). |

Screenshots (real browser, from the test): `game/design/beta/img/cyc13-systems-hello-{1280x720,390x844,195x422}.jpg`.

## 2. `mm-shop-pin` in the Backup
**What changed** (`game/shared/mm-backup.js`):
- New cleaner `CLEANERS['mm-shop-pin']`. It uses the same rule as `realm.js rmShopPinGet`: `{v:1, id:/^[A-Za-z0-9_-]{1,40}:\d{1,2}$/}`, rebuilt as exactly `{v, id}`.
- Label: "shop saving-for pin". It counts as a setting (`mm-` prefix).
- Export carries the pin. A damaged stored pin is left out and named in the warnings. On Restore, an invalid pin is skipped and this device's pin is untouched.
- KNOWN is now 61, under MAX_KEYS 80. The bundle VERSION is unchanged, because the change is additive.
- The SAVE-KEYS row now reads backup "yes".

**Test:** new `game/tests/cyc13-s-backup-shop-pin.test.js` (node/full, registered). It covers:
- KNOWN, setting and label;
- export and the restore round trip;
- 9 invalid values are skipped and the device pin is kept;
- extra fields are dropped;
- a damaged stored pin is left out of the export;
- an unknown neighbour key is still only skipped.

| Check | Result |
|---|---|
| Backup test on base `mm-backup.js` | 8 FAILED |
| Backup test on the branch | ALL PASSED |
| `shared-mm-backup` (node) | 65 passed, 0 failed |
| `cyc4-assist-scale`, `shared-bugbash-fuzz` (91), `save-hostile-fuzz` | ALL PASSED |
| `beta-r4-o04-backup` with `NODE_ONLY=1` | ALL PASSED |
| `cyc2-notebook`, node part | All backup checks PASS. The browser part did not run in that call, because playwright was not on NODE_PATH. |

## 3. ID-62 / ID-63 / ID-65
Not built. In `design/IDEAS.md`, ID-62, ID-63 and ID-65 are all still `proposed`; none is approved by U or L. Following the brief, unapproved ideas are not built.

## Unresolved
- **Heart hidden at 195x422.** In the screenshot the fox's heart sits under the DOM bag bar, because the test puts the fox high on the screen. The heart is in the camera view, but DOM HUD panels can cover world sprites. This is not specific to the hello.
- **Cache versions.** The `style.css` and `main.js` cache versions in `index.html` were not bumped; the coordinator does this at integration.
- **No real phone.** Touch was Playwright only.
- **Full stamp not run.** Only targeted tests ran.

## Proposals
1. ID-60 counter-proposal: D can now re-propose "Seen" on the Museum Wild Fauna card, fed by `animalHello` (the `animalHelloHas(mask, FF_FAUNA_INDEX[id])` helper exists).
2. U or L: review ID-62 and ID-63. Both are cheap follow-ons now that ID-59 is built: `animalHelloGreet(spec, time)` already does the turn and the heart.
3. U: decide whether the general `#achievement-toast` should use the compact <= 300 px layout too. Achievement and shop-note toasts still cover the bag bar at 195 and 240 wide (measured: toast 70-157 vs bag 124-178 at 195).
