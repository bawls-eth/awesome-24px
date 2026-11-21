// Hub daily gift card (GF2). Uses MMGift (GF1): one claim per UTC day, the count is TOTAL days claimed (no streak, no timer, nothing bought).
// Pay paths (additive, only the fields named here): shards -> `pixeltown-save-v1`.realm.shards (the field the Realm merges with its own
// delta, never any other key of the town save); a milestone token -> first free slot of the `pixeltown-mm-v1` stash, written through
// MMProfile.clean (stash full -> shards instead). The gift state itself is `pixeltown-gift-v1`. All text uses textContent.
(function () {
  'use strict';
  const G = window.MMGift, P = window.MMProfile, D = window.MMDaily;
  const $ = (id) => document.getElementById(id);
  if (!G || !P || !D || !$('gift-card')) return;
  const SAVE = 'pixeltown-save-v1', MM = 'pixeltown-mm-v1', MAX_SHARDS = 9999999;
  const TEST = /[?&]test=1(&|$)/.test(location.search);
  function today() {
    const m = TEST ? /[?&]gdate=(\d{4}-\d{2}-\d{2})(&|$)/.exec(location.search) : null;
    return (m && D.cleanDate(m[1])) || new Date().toISOString().slice(0, 10);
  }
  const rd = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };

  function payShards(n) {
    const raw = rd(SAVE);
    let o; try { o = JSON.parse(raw); } catch (e) { return false; }
    if (!o || typeof o !== 'object' || Array.isArray(o)) return false; // no usable town save: nothing is paid and nothing is claimed
    const realm = o.realm && typeof o.realm === 'object' && !Array.isArray(o.realm) ? o.realm : {};
    const cur = Number.isFinite(Number(realm.shards)) && Number(realm.shards) > 0 ? Math.floor(Number(realm.shards)) : 0;
    realm.shards = Math.min(MAX_SHARDS, cur + n);
    o.realm = realm;
    try { localStorage.setItem(SAVE, JSON.stringify(o)); return true; } catch (e) { return false; }
  }
  // Returns {ok, what} describing what was paid.
  function pay(gift) {
    if (gift.kind === 'token') {
      const prof = P.clean(rd(MM));
      const slot = prof.stash.indexOf(null);
      if (slot >= 0) {
        prof.stash[slot] = { id: gift.token, r: 0 };
        try { localStorage.setItem(MM, JSON.stringify(P.clean(prof))); return { ok: true, what: 'A keepsake token went to your Lantern stash.' }; } catch (e) { return { ok: false }; }
      }
      return payShards(G.SHARDS_MAX) ? { ok: true, what: 'Your stash is full, so you got ' + G.SHARDS_MAX + ' shards instead.' } : { ok: false };
    }
    return payShards(gift.shards) ? { ok: true, what: gift.shards + ' shards were added to your Realm purse.' } : { ok: false };
  }

  let note = '';
  function render() {
    const t = today(), st = G.load(localStorage, t), s = G.summary(st, t);
    $('gift-total').textContent = 'Days claimed: ' + s.total;
    const pv = s.preview;
    $('gift-today').textContent = s.claimedToday ? 'Today\'s gift is claimed.' : 'Today\'s gift: ' + (pv.kind === 'token' ? 'a keepsake token' : pv.shards + ' shards');
    const b = $('gift-claim');
    b.disabled = !s.canClaim;
    b.textContent = s.claimedToday ? 'Claimed today' : 'Claim';
    $('gift-note').textContent = note || (s.claimedToday ? 'Come back whenever you like.' : '');
  }
  function claim() {
    const t = today(), before = G.load(localStorage, t), c = G.claim(before, t);
    if (!c.gift) { render(); return; }
    const rawBefore = rd(G.KEY);
    if (!G.save(localStorage, c.state)) { note = 'Could not save the gift (storage is blocked). Nothing was claimed.'; render(); return; }
    const r = pay(c.gift);
    if (!r.ok) {
      try { if (rawBefore === null) localStorage.removeItem(G.KEY); else localStorage.setItem(G.KEY, rawBefore); } catch (e) { /* ignore */ }
      note = 'The gift will wait until your town save is ready. Nothing was claimed.';
    } else note = 'Gift claimed. ' + r.what;
    render();
  }
  function toggle(open) {
    const c = $('gift-card'); c.hidden = open === undefined ? !c.hidden : !open;
    $('gift-btn').setAttribute('aria-expanded', String(!c.hidden));
    if (!c.hidden) { note = ''; render(); }
  }
  $('gift-btn').addEventListener('click', () => toggle());
  $('gift-close').addEventListener('click', () => { toggle(false); $('gift-btn').focus(); });
  $('gift-claim').addEventListener('click', claim);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('gift-card').hidden) { toggle(false); $('gift-btn').focus(); } });
})();
