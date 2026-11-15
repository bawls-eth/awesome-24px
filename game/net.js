// Firebase Realtime Database transport for Pixeltown.
//
// Replaces the old Socket.io server: player positions and chat live in a
// shared Realtime Database, and Firebase pushes changes to every connected
// client automatically (no polling, no server to run). Presence is handled by
// onDisconnect(), so a player vanishes from the town when they close the tab.

const WORLD = { width: 1600, height: 1200 };
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
    this.joinTime = 0;
    this.db = null;
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

    let snap;
    try {
      snap = await this.playersRef.once('value');
    } catch (e) {
      this.emit('error', 'Could not reach the town database. Check the Firebase config and database rules.');
      return;
    }

    if (snap.numChildren() >= MAX_PLAYERS) {
      this.emit('townFull');
      return;
    }

    this.name = profile.name;
    this.playerRef = this.playersRef.push();
    this.id = this.playerRef.key;

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
      this.emit('error', 'Could not join the town (database write was rejected). Check the database rules.');
      return;
    }

    this.playerRef.onDisconnect().remove();
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
      this.emit('blockAdded', { key: s.key, x: v.x, y: v.y, ownerId: v.ownerId });
    });

    this.blocksRef.on('child_removed', (s) => {
      this.emit('blockRemoved', { key: s.key });
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

  sendChat(text) {
    if (!this.chatRef || !this.id) return;
    this.chatRef.push({
      id: this.id,
      name: this.name,
      text,
      t: firebase.database.ServerValue.TIMESTAMP,
    });
  }

  placeBlock(x, y) {
    if (!this.blocksRef || !this.id) return;
    this.blocksRef.child(`${x}_${y}`).set({
      x,
      y,
      ownerId: this.id,
      t: firebase.database.ServerValue.TIMESTAMP,
    }).catch(() => {});
  }

  removeBlock(key) {
    if (!this.blocksRef) return;
    this.blocksRef.child(key).remove().catch(() => {});
  }
}
