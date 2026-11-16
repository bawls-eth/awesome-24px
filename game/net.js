// Firebase Realtime Database transport for Pixeltown.
//
// Replaces the old Socket.io server: player positions and chat live in a
// shared Realtime Database, and Firebase pushes changes to every connected
// client automatically (no polling, no server to run). Presence is handled by
// onDisconnect(), so a player vanishes from the town when they close the tab.

const WORLD = { width: 2400, height: 1200 };
const MAX_PLAYERS = 10;

function firebaseConfigLooksReal() {
  return (
    typeof firebaseConfig !== 'undefined' &&
    firebaseConfig &&
    typeof firebaseConfig.apiKey === 'string' &&
    !firebaseConfig.apiKey.startsWith('PASTE_') &&
    typeof firebaseConfig.databaseURL === 'string' &&
    !firebaseConfig.databaseURL.includes('PASTE_')
  );
}

class TownNet {
  constructor() {
    this.handlers = {};
    this.id = null;
    this.name = '';
    this.playerRef = null;
    this.playersRef = null;
    this.chatRef = null;
    this.blocksRef = null;
    this.guestbookRef = null;
    this.joinTime = 0;
    this.db = null;
    this.playerCountRef = null;
  }

  on(event, cb) {
    this.handlers[event] = cb;
  }

  emit(event, payload) {
    if (this.handlers[event]) this.handlers[event](payload);
  }

  // Reads the count, claims a slot, publishes self, then fires 'init' with
  // only the local player. Remote players (existing + future) arrive through
  // startListening(), which the scene calls once its handlers are wired up.
  // Lightweight, read-only peek at how many villagers are in town right
  // now — used on the join screen, before this player has actually
  // joined. Safe to call repeatedly; initializeApp() tolerates re-calls.
  watchOnlineCount(callback) {
    if (!firebaseConfigLooksReal()) {
      callback(null);
      return;
    }
    try {
      firebase.initializeApp(firebaseConfig);
    } catch (e) {
      // already initialized — fine.
    }
    const ref = firebase.database().ref('players');
    ref.on('value', (snap) => callback(snap.numChildren()));
  }

  async join(profile) {
    if (!firebaseConfigLooksReal()) {
      this.emit('configMissing');
      return;
    }

    try {
      firebase.initializeApp(firebaseConfig);
    } catch (e) {
      // initializeApp throws if called twice (e.g. a rejoin) — safe to ignore.
    }
    this.db = firebase.database();
    this.playersRef = this.db.ref('players');
    this.chatRef = this.db.ref('chat');
    this.blocksRef = this.db.ref('blocks');
    this.guestbookRef = this.db.ref('guestbook');
    this.scavengerRef = this.db.ref('scavenger');
    this.tournamentRef = this.db.ref('tournament');
    this.playerCountRef = this.db.ref('playerCount');

    this.name = profile.name;
    // Reserve our player key up front (push() only allocates a key locally —
    // it does not write anything to the server), then atomically claim a
    // capacity slot via a transaction on a small counter node. A plain
    // read-then-write check here (read numChildren, compare, then write) is
    // exactly the race this replaces: two joins in the same window could
    // both pass the read before either writes, blowing past MAX_PLAYERS.
    // The transaction's updateFn is retried by the SDK against the latest
    // server value until it either commits or we deliberately abort it by
    // returning undefined, so only one joiner over the cap can ever succeed.
    this.playerRef = this.playersRef.push();
    this.id = this.playerRef.key;

    let countResult;
    try {
      countResult = await this.playerCountRef.transaction((current) => {
        const n = current || 0;
        if (n >= MAX_PLAYERS) return; // abort — do not increment, town is full
        return n + 1;
      });
    } catch (e) {
      this.playerRef = null;
      this.emit('error', 'Could not reach the town database. Check the Firebase config and database rules.');
      return;
    }

    if (!countResult.committed) {
      // Town is at capacity — release the reserved (never-written) player
      // key and bail out before touching /players at all.
      this.playerRef.remove().catch(() => {});
      this.playerRef = null;
      this.emit('townFull');
      return;
    }

    const self = {
      id: this.id,
      name: profile.name,
      species: profile.species,
      frame: profile.frame,
      x: WORLD.width / 2,
      y: WORLD.height / 2,
      facing: 1,
      score: 0,
      emote: null,
      emoteAt: 0,
    };
    this.localScore = 0;

    try {
      await this.playerRef.set({
        name: self.name,
        species: self.species,
        frame: self.frame,
        x: self.x,
        y: self.y,
        facing: self.facing,
        score: 0,
        emote: null,
        emoteAt: 0,
        t: firebase.database.ServerValue.TIMESTAMP,
      });
    } catch (e) {
      // We already claimed a capacity slot above — give it back since we
      // never actually occupied it.
      this.playerCountRef.transaction((current) => Math.max(0, (current || 0) - 1)).catch(() => {});
      this.playerRef = null;
      this.emit('error', 'Could not join the town (database write was rejected). Check the database rules.');
      return;
    }

    this.playerRef.onDisconnect().remove();
    // Keep the counter accurate when a player disconnects without a clean
    // leave (closed tab, lost connection, etc.) — mirrors the player-node
    // onDisconnect() above. onDisconnect() can't run a transaction, but
    // ServerValue.increment() is itself atomic server-side, so a plain
    // queued set() here is race-free the same way the join transaction is.
    this.playerCountRef.onDisconnect().set(firebase.database.ServerValue.increment(-1));
    this.joinTime = Date.now();

    // If our own node gets removed server-side while this tab still thinks
    // it's connected (e.g. iOS backgrounds the tab, the connection drops and
    // onDisconnect fires, but the page's JS keeps running briefly after),
    // null out playerRef so every write method below becomes a safe no-op
    // instead of recreating a bare, broken record via update().
    this.playerRef.on('value', (snap) => {
      if (!snap.exists() && this.playerRef) {
        this.playerRef = null;
        this.emit('selfRemoved');
      }
    });

    this.emit('init', { self, players: { [this.id]: self }, world: WORLD });
  }

  // Attach the live listeners. child_added fires for every existing player as
  // well as future ones, so it drives both the initial population and joins.
  startListening() {
    this.playersRef.on('child_added', (s) => {
      if (s.key === this.id) return;
      const v = s.val();
      if (!v || !v.name || !v.species) return; // skip broken/zombie records
      this.emit('playerJoined', { id: s.key, ...v });
    });

    this.playersRef.on('child_changed', (s) => {
      if (s.key === this.id) return;
      const v = s.val();
      if (!v || !v.name) return;
      this.emit('playerUpdated', { id: s.key, ...v });
    });

    this.playersRef.on('child_removed', (s) => {
      if (s.key === this.id) return;
      this.emit('playerLeft', s.key);
    });

    this.chatRef.limitToLast(30).on('child_added', (s) => {
      const m = s.val();
      if (!m) return;
      this.emit('chat', {
        id: m.id,
        name: m.name,
        text: m.text,
        isOld: typeof m.t === 'number' && m.t < this.joinTime,
      });
    });

    this.blocksRef.on('child_added', (s) => {
      const v = s.val();
      if (!v) return;
      this.emit('blockAdded', { key: s.key, x: v.x, y: v.y, type: v.type || 'wood', ownerId: v.ownerId });
    });

    this.blocksRef.on('child_removed', (s) => {
      this.emit('blockRemoved', { key: s.key });
    });

    // Only the most recent 20 notes — this is a shared sign, not a full
    // history browser, so no point loading an unbounded guestbook on join.
    this.guestbookRef.limitToLast(20).on('child_added', (s) => {
      const v = s.val();
      if (!v || !v.text) return;
      this.emit('guestbookEntry', { key: s.key, id: v.id, name: v.name, text: v.text, t: v.t || 0 });
    });
  }

  // Writes via transaction instead of update(): if our node has already been
  // removed server-side (onDisconnect fired while this write was in flight —
  // a real race, not just a theoretical one), the transaction sees `current
  // === null` and aborts instead of recreating a bare, identity-less node.
  async writeIfAlive(mutate) {
    if (!this.playerRef) return undefined;
    const ref = this.playerRef;
    let result;
    try {
      result = await ref.transaction((current) => {
        if (current === null) return undefined; // abort — never recreate from nothing
        const next = { ...current };
        mutate(next);
        // RTDB stores `null` fields by omitting the key entirely, which can
        // round-trip back through a transaction as an explicit `undefined` —
        // Firebase's own validator rejects that, so strip it defensively.
        Object.keys(next).forEach((k) => { if (next[k] === undefined) delete next[k]; });
        return next;
      });
    } catch (e) {
      return undefined; // transient failure — not evidence our node was removed
    }
    // Only treat a non-commit as "we got removed" once that's actually
    // confirmed by the final snapshot, not just any abort reason.
    if (!result.committed && !result.snapshot.exists() && this.playerRef === ref) {
      this.playerRef = null;
      this.emit('selfRemoved');
    }
    return result;
  }

  move(x, y, facing) {
    this.writeIfAlive((current) => {
      current.x = x;
      current.y = y;
      current.facing = facing;
    });
  }

  emote(symbol) {
    // Transactions can retry, so they can't use the ServerValue.TIMESTAMP
    // sentinel (it would differ per retry) — client time is fine here since
    // emoteAt is only ever used to detect "this changed", not displayed.
    this.writeIfAlive((current) => {
      current.emote = symbol;
      current.emoteAt = Date.now();
    });
  }

  async addScore(delta) {
    const result = await this.writeIfAlive((current) => {
      current.score = (current.score || 0) + delta;
    });
    if (result && result.committed) this.localScore = result.snapshot.val().score;
  }

  // Lets a player change species/frame after joining (the Able Sisters
  // shop) — everyone else's child_changed listener picks this up the
  // same way it already picks up position/facing.
  updateAppearance(species, frame) {
    this.writeIfAlive((current) => {
      current.species = species;
      current.frame = frame;
    });
  }

  // Equip an unlocked achievement as a small badge shown next to your name
  // in every client's player list — same sync path as appearance changes.
  // Pass null to unequip.
  updateTitle(achievementId) {
    this.writeIfAlive((current) => {
      current.title = achievementId || null;
    });
  }

  sendChat(text) {
    if (!this.chatRef || !this.id) return;
    this.chatRef.push({
      id: this.id,
      name: this.name,
      text,
      t: firebase.database.ServerValue.TIMESTAMP,
    });
  }

  placeBlock(x, y, type = 'wood') {
    if (!this.blocksRef || !this.id) return;
    this.blocksRef.child(`${x}_${y}`).set({
      x,
      y,
      type,
      ownerId: this.id,
      t: firebase.database.ServerValue.TIMESTAMP,
    }).catch(() => {});
  }

  removeBlock(key) {
    if (!this.blocksRef) return;
    this.blocksRef.child(key).remove().catch(() => {});
  }

  // Leave a short signed note on the town guestbook — persisted for
  // everyone, same push-and-listen shape as sendChat(), just a separate
  // ref so it doesn't get mixed in with (or capped out by) live chat.
  leaveGuestbookNote(text) {
    if (!this.guestbookRef || !this.id) return;
    this.guestbookRef.push({
      id: this.id,
      name: this.name,
      text,
      t: firebase.database.ServerValue.TIMESTAMP,
    }).catch(() => {});
  }

  // Daily scavenger hunt: "who found today's spot first" is genuinely
  // contested state, unlike everything else in this file (which is just
  // broadcast-and-listen) — a transaction on /scavenger/{dayKey} makes the
  // first successful write win and every later one abort, so two players
  // racing to the same spot can't both claim the reward.
  claimScavengerSpot(dayKey) {
    if (!this.scavengerRef || !this.id) return Promise.resolve({ success: false, claim: null });
    return this.scavengerRef.child(String(dayKey)).transaction((current) => {
      if (current) return; // already claimed — abort, don't overwrite
      return { id: this.id, name: this.name, t: Date.now() };
    }).then((result) => {
      const claim = result.snapshot.val();
      return { success: !!(result.committed && claim && claim.id === this.id), claim };
    }).catch(() => ({ success: false, claim: null }));
  }

  watchScavenger(dayKey, callback) {
    if (!this.scavengerRef) return;
    this.scavengerRef.child(String(dayKey)).on('value', (snap) => callback(snap.val()));
  }

  // Daily fishing tournament record: a compare-and-swap transaction, same
  // shape as the scavenger hunt claim, but keyed on "is this catch bigger"
  // instead of "is this the first claim" — the biggest size commits, every
  // smaller/later one aborts without overwriting the real record.
  submitTournamentCatch(dayKey, sizeCm) {
    if (!this.tournamentRef || !this.id) return Promise.resolve({ success: false, record: null });
    return this.tournamentRef.child(String(dayKey)).transaction((current) => {
      if (current && current.size >= sizeCm) return; // not a new record — abort
      return { id: this.id, name: this.name, size: sizeCm, t: Date.now() };
    }).then((result) => {
      const record = result.snapshot.val();
      return { success: !!(result.committed && record && record.id === this.id), record };
    }).catch(() => ({ success: false, record: null }));
  }

  watchTournament(dayKey, callback) {
    if (!this.tournamentRef) return;
    this.tournamentRef.child(String(dayKey)).on('value', (snap) => callback(snap.val()));
  }

  // Walkie-talkie: a short voice clip addressed to one other player's id.
  // Lives under /walkie/{targetId}, not /players, so it's never confused
  // with presence data and survives the sender leaving.
  sendWalkie(targetId, base64Data, mime) {
    if (!this.db || !this.id || !targetId) return;
    this.db.ref(`walkie/${targetId}`).push({
      from: this.id,
      fromName: this.name,
      data: base64Data,
      mime: mime || 'audio/webm',
      t: firebase.database.ServerValue.TIMESTAMP,
    }).catch(() => {});
  }
}
