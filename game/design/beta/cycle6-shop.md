# Cycle 6: Realm shop ("doesn't allow purchase and the UI is off")

Branch `cyc6-shop`. Checked on 2026-11-25 in headless Chromium (Playwright) through `/tmp/bt.sh`, local server on port 9606. Firebase was blocked (`blockDb` + every WebSocket closed in the world page; `offlineStub` + "Play offline" in the Town). No page made a DB request: `db.attempts() === 0`.

## What I reproduced (real clicks and taps, no hooks for the shop)

Pages: the standalone world Realm (`game/games/mad-maze/index.html?mode=world…`, `realm-world.js`), and the Town Realm (`game/index.html` → "Play offline" → Realm; the gate entry used the `enterRealm()` hook, but everything in the shop was a real click). Viewports: 1280x720 (mouse), 390x844 (touch), 195x422 (touch). I opened the shop with the 🎒 HUD button and then the backpack's 🛒 Shop (V) button (the HUD has no separate Shop button), and with the V key on desktop.

- **Buying with enough shards works** at all three sizes and in both pages. 30 💎 → tap "Buy 24💎" → 6 💎, one item in the pack, saved to `pixeltown-save-v1`. It also works at level 1 / best wave 0 (7 Common offers), at level 9 (21 offers), and with an active ranger hero (the bow-family weapons are listed and buy fine).
- **With too few shards or a full pack, the shop looks broken.** Every Buy button looked exactly like a live one (same fill, opacity 1). The only difference was the `disabled` attribute. A disabled button swallows the tap, so the tap did nothing and the panel said nothing. With 6 💎, every "Buy 24💎" looked buyable and none of them did anything. I think this is what "doesn't allow purchase" means: from the player's side it is indistinguishable from a broken button. Before shots: `img/cyc6-shop-before-desktop-too-poor.jpg`, `img/cyc6-shop-before-town-too-poor.jpg` and `img/cyc6-shop-before-phone-full.jpg`.
- **A successful buy also gave almost no visible feedback.** `buy()` draws its float text on the canvas, behind the 85% shop overlay, so it is not visible. The only sign of the buy was the small wallet number changing.
- **"UI is off" (layout).** The shop reuses the backpack's `#realm-bp-list` grid. On widths above 420 px, `.rar` (grid-column 2) was auto-placed under the Buy button, so "Common" sat under the button instead of under the name (`img/cyc6-shop-before-desktop-open.jpg`). At 195 px, long names such as "Quickfire Wand" and "Uncommon" ran under the Buy button (`img/cyc6-shop-before-xs-bought.jpg`).

## Root causes

1. `renderShop()` marked an unbuyable offer with `disabled`, and no CSS styled `#realm-bp-list button:disabled` outside the 8-bit backpack (`.rm-bp8`). That gave a live-looking button that silently ate the tap.
2. Neither `buy()` nor the click handler gave any in-panel feedback, for success or refusal.
3. The shop rows inherited the backpack row grid (`style.css` / `mad-maze.css` set `.rar { grid-column: 2 }` plus `button.eq { grid-column: 2; grid-row: 1 }`), and nothing let the text column shrink or wrap.

The unlock rules (`RM_SHOP_UNLOCK` / `RM_SHOP_UNLOCK_LV`), `shopStock()`, `buy()`, the hit targets (44 px, `elementFromPoint` lands on the button), the panel scroll on phone and the hero-family weapon list were all correct. I did not change them.

## What I changed (smallest safe change)

- `game/realm.js`
  - The shop click goes through a new `_shopTap(id, r)`. It calls the unchanged `buy()`, then writes one line into a new `#realm-shop-msg` (`role="status"`, `aria-live="polite"`):
    - on success: "Bought Common Spark Wand: it is in your backpack (1 / 24)."
    - not enough shards: "You need 18 more 💎 for the Common Swift Charm."
    - pack full: "Your backpack is full: sell or combine something first."
    - Afterwards it puts keyboard focus back on the same row, because the re-render drops it.
  - `renderShop()`
    - An unbuyable offer now gets `class="off"` and `aria-disabled="true"` instead of `disabled`, so the tap reaches `_shopTap` and gets an answer.
    - Its `aria-label` adds "(need N more shards)" or "(backpack full)".
    - The wallet line becomes a sticky header holding the message.
    - `buy()` still refuses on its own; nothing about price, stock or save changes.
  - `_panel('shop')` clears the message when the shop opens.
- `game/realm-ui.css` (loaded by both the Town and the Realm page):
  - Shop-scoped row grid: name, rarity and stat stacked on the left, with Buy spanning them on the right. The text column can shrink and wrap.
  - Unbuyable Buy buttons are dimmed and dashed.
  - The wallet/message header is sticky so it stays in view while the list scrolls.
- No save keys were added. `pixeltown-save-v1` is untouched.
- I did not edit `firebase-config.js`, `net.js` or `ci-status.json`.
- New test `game/tests/cyc6-shop.test.js`, registered in `test-tiers.json` as browser/full.

## Checks actually run

- **New test** `game/tests/cyc6-shop.test.js`: real clicks (1280x720) and real taps (390x844, 195x422) on the world page.
  - It covers open via 🎒 → 🛒 Shop and via V; buying with enough shards; buying with too few shards; buying with a full pack; level 1 / best wave 0; layout (name and rarity text clear of the Buy button); the message being visible (`elementFromPoint`); no sideways scroll; the save; no console errors; and `db.attempts() === 0`.
  - **Before the fix:** 13 FAILED. **After:** ALL PASSED.
- **Related existing tests** (`grep -l shop game/tests`, run on port 9606 via `/tmp/bt.sh`): `realm-shop-death`, `nexus-vendor`, `item-icons`, `realm-phone-layout`, `realm-polish3`, `world-wording`. All PASS after the change.
  - In the baseline run before my change, `item-icons` failed once: "phone: backpack rows have 8 loaded icons", with 3 icons at width 0. It passed after the change, and my change does not touch icons, so I count it as a load-dependent flake.
- **Town Realm by hand:** with 30 💎, the first buy goes through (→ 6 💎). A second tap on an unaffordable offer then shows "You need 18 more 💎…" (`img/cyc6-shop-after-town-too-poor.jpg`).
- **Screenshots:** `game/design/beta/img/cyc6-shop-before-*.jpg` and `cyc6-shop-after-*.jpg` (desktop, phone and 195 px states, plus Town).

## What I could not verify

- **The owner's exact failing case.** In every case I tried, a purchase with enough shards succeeded. If the owner's buy fails with enough shards, it is something I did not hit, such as an old cached page, a PvP duel (where the shop is intentionally closed), or a specific save.
- **Cached CSS in the Town.** `game/index.html` loads `realm-ui.css?v=20261123x`, and I did not bump the version string. A browser with the old CSS cached will get the new message and `aria-disabled` behaviour but not the new row layout or dimmed style until the version is bumped at merge.
- **Real devices.** I did not test on a real phone, a gamepad, or with a screen reader. Touch was Playwright `isMobile` / `hasTouch` emulation.
- **Nexus Vendor.** It is a separate dust stall, and I left it unchanged. Its own test (`nexus-vendor`) passes, and its "🛒 Shop (💎 shards)" button opens this same shop. I did not reach the Vendor by walking; that test opens the Nexus with a hook.
- **Missing item icon.** One after-shot (`cyc6-shop-after-phone-full.jpg`) shows a missing Hearty Charm icon. This is the same load-dependent icon flake as above and was not investigated.
- **Full suite.** I did not run `node game/tests/run-all.js`, only the related shop tests.
