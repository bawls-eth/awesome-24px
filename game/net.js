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

    this.emit('init', { self, players: { [this.id]: self }, world: WORLD });
  }

  // Attach the live listeners. child_added fires for every existing player as
  // well as future ones, so it drives both the initial population and joins.
  startListening() {
    this.playersRef.on('child_added', (s) => {
      if (s.key === this.id) return;
      this.emit('playerJoined', { id: s.key, ...s.val() });
    });

    this.playersRef.on('child_changed', (s) => {
      if (s.key === this.id) return;
      this.emit('playerUpdated', { id: s.key, ...s.val() });
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
  }

  move(x, y, facing) {
    if (this.playerRef) this.playerRef.update({ x, y, facing });
  }

  emote(symbol) {
    if (this.playerRef) this.playerRef.update({ emote: symbol, emoteAt: firebase.database.ServerValue.TIMESTAMP });
  }

  addScore(delta) {
    if (!this.playerRef) return;
    this.localScore = (this.localScore || 0) + delta;
    this.playerRef.update({ score: this.localScore });
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
}
