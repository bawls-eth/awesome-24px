// Same-device party transport (CP1): wraps BroadcastChannel('mm-party-<seed>') for MMWorldParty messages.
// Same browser, same origin only. Free play, no accounts. Every message in and out goes through MMWorldParty.clean; anything else is dropped.
// If BroadcastChannel is missing (or throws) open() returns an inert transport: send() is false, onMessage() never fires, close() is safe.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./mm-world-party.js'));
  else root.MMPartyBC = factory(root.MMWorldParty);
}(typeof self !== 'undefined' ? self : this, function (WP) {
  const SEED_RE = /^[A-Za-z0-9_-]{1,32}$/;
  const PREFIX = 'mm-party-';
  const seedOk = (s) => (typeof s === 'string' || (typeof s === 'number' && isFinite(s))) && SEED_RE.test(String(s));
  function channelName(seed) { return seedOk(seed) ? PREFIX + String(seed) : null; }

  // open(seed, opts) -> { ok, name, send(msg), onMessage(fn) -> off, close() }. opts.BC overrides the constructor (tests).
  function open(seed, opts) {
    const name = channelName(seed);
    const BC = (opts && opts.BC) || (typeof BroadcastChannel !== 'undefined' ? BroadcastChannel : null);
    const handlers = [];
    let ch = null, closed = false;
    if (name && BC) {
      try {
        ch = new BC(name);
        ch.onmessage = (ev) => {
          if (closed) return;
          const m = WP.clean(ev && ev.data);
          if (!m) return;
          handlers.slice().forEach((h) => { try { h(m); } catch (e) { /* a bad handler never breaks the channel */ } });
        };
      } catch (e) { ch = null; }
    }
    return {
      ok: !!ch, name: name,
      // returns true when a clean message was posted
      send(msg) {
        if (!ch || closed) return false;
        const m = WP.clean(msg);
        if (!m) return false;
        try { ch.postMessage(m); return true; } catch (e) { return false; }
      },
      onMessage(fn) {
        if (typeof fn !== 'function') return () => {};
        handlers.push(fn);
        return () => { const i = handlers.indexOf(fn); if (i >= 0) handlers.splice(i, 1); };
      },
      close() {
        if (closed) return;
        closed = true; handlers.length = 0;
        try { if (ch) ch.close(); } catch (e) { /* already closed */ }
        ch = null;
      }
    };
  }
  return { PREFIX, channelName, seedOk, open };
}));
