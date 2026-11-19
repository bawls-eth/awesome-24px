// Firebase Realtime Database transport for Pixeltown.
//
// Replaces the old Socket.io server: player positions and chat live in a
// shared Realtime Database, and Firebase pushes changes to every connected
// client automatically (no polling, no server to run). Presence is handled by
// onDisconnect(), so a player vanishes from the town when they close the tab.

// The original village occupies (0,0)-(2400,1200) — unchanged, so none of
// its landmark coordinates needed to move. The world now extends well
// past it in every direction (negative x/y included) for a wilderness
// ring and an ocean border; originX/originY tell main.js where that
// bigger rect actually starts, since it's no longer (0,0).
const WORLD = { width: 5800, height: 4600, originX: -1700, originY: -1700 };
const MAX_PLAYERS = 10;

// Upper bounds for anything read back out of the shared database. The rules
// are open (see the README), so another client — or someone poking the REST
// API by hand — can write any shape at all; these keep a malformed record
// from breaking or defacing everyone else's screen. Not security, just
// robustness: the same limits the UI already enforces on input.
const MAX_NAME_LEN = 16;
const MAX_CHAT_LEN = 140;
const MAX_NOTE_LEN = 80;
// Chat older than this isn't replayed into a fresh client's log on join —
// a quiet town shouldn't greet you with yesterday's conversation.
const CHAT_MAX_AGE_MS = 2 * 60 * 60 * 1000;

// Control characters, line/paragraph separators, and bidi overrides/isolates
// (which can flip the direction of everything rendered after them).
const UNSAFE_TEXT_CHARS = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u2028\\u2029\\u202a-\\u202e\\u2066-\\u2069]', 'g');

function cleanText(v, max) {
  if (typeof v !== 'string' && typeof v !== 'number') return '';
  // Array.from splits by code point, so the cut never leaves half an emoji.
  return Array.from(String(v).replace(UNSAFE_TEXT_CHARS, ' ').trim()).slice(0, max).join('').trim();
}

function clampNum(v, min, max, fallback) {
  const n = typeof v === 'number' ? v : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function clampToWorld(x, y) {
  return {
    x: clampNum(x, WORLD.originX, WORLD.originX + WORLD.width, 1200),
    y: clampNum(y, WORLD.originY, WORLD.originY + WORLD.height, 600),
  };
}

// Normalizes one /players/{id} record. Unknown extra fields are passed
// through untouched (newer clients may add some); every field this client
// actually reads is type-checked and bounded. Returns null for records too
// broken to show at all.
function sanitizePlayer(id, v) {
  if (!v || typeof v !== 'object') return null;
  const name = cleanText(v.name, MAX_NAME_LEN);
  if (!name || typeof v.species !== 'string' || !v.species) return null;
  const pos = clampToWorld(v.x, v.y);
  return {
    ...v,
    id,
    name,
    species: v.species.slice(0, 48),
    frame: Math.floor(clampNum(v.frame, 0, 9999, 0)),
    x: pos.x,
    y: pos.y,
    facing: v.facing === -1 ? -1 : 1,
    score: Math.floor(clampNum(v.score, -1e9, 1e9, 0)),
    emote: typeof v.emote === 'string' ? v.emote.slice(0, 8) : null,
    emoteAt: clampNum(v.emoteAt, 0, Number.MAX_SAFE_INTEGER, 0),
    title: typeof v.title === 'string' ? v.title.slice(0, 48) : null,
  };
}

// Display names that come from claim/record nodes (scavenger, tournament)
// get the same treatment as player names.
function cleanClaimName(v) {
  const name = cleanText(v, MAX_NAME_LEN) || 'someone';
  return typeof censorBlockedTerms === 'function' ? censorBlockedTerms(name) : name;
}

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
    // selfRef is our reserved /players/{id} ref and never changes;
    // playerRef is the same ref while our record is live, null while it's
    // gone (dropped connection) — so writes become no-ops until rejoin().
    this.selfRef = null;
    this.state = null; // last known own record, used to recreate it on rejoin
    this.connected = false;
    this.everConnected = false;
    this.rejoining = false;
    this.gaveUp = false;
    this.serverTimeOffset = 0;
    this.moveInFlight = false;
    this.pendingMove = null;
    this.seenChatKeys = new Set();
  }

  serverNow() {
    return Date.now() + this.serverTimeOffset;
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
      name: cleanText(profile.name, MAX_NAME_LEN),
      species: profile.species,
      frame: profile.frame,
      // The village center, not the world's center — the world is much
      // bigger than the village now, with wilderness/ocean around it.
      x: 1200,
      y: 600,
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

    this.selfRef = this.playerRef;
    this.state = {
      name: self.name, species: self.species, frame: self.frame,
      x: self.x, y: self.y, facing: self.facing, title: null,
    };
    this.armPresence();
    this.joinTime = Date.now();

    // If our own node gets removed server-side while this tab is still
    // running (the connection dropped long enough for onDisconnect to fire —
    // a flaky network, iOS backgrounding the tab, a laptop lid), null out
    // playerRef so every write below becomes a safe no-op instead of
    // recreating a bare, broken record, then put ourselves back in town as
    // soon as we're connected again.
    this.selfRef.on('value', (snap) => {
      if (snap.exists() || this.rejoining) return;
      this.handleSelfGone();
    });

    this.watchConnection();

    this.emit('init', { self, players: { [this.id]: self }, world: WORLD });
  }

  // (Re-)queue the server-side cleanup for our presence. onDisconnect ops
  // fire once and are tied to the connection that registered them, so they
  // must be re-armed after every reconnect. Both are idempotent per path,
  // so arming twice on one connection never double-decrements.
  armPresence() {
    if (!this.selfRef) return;
    this.selfRef.onDisconnect().remove().catch(() => {});
    // Keep the counter accurate when a player disconnects without a clean
    // leave (closed tab, lost connection, etc.) — mirrors the player-node
    // onDisconnect() above. onDisconnect() can't run a transaction, but
    // ServerValue.increment() is itself atomic server-side, so a plain
    // queued set() here is race-free the same way the join transaction is.
    this.playerCountRef.onDisconnect().set(firebase.database.ServerValue.increment(-1)).catch(() => {});
  }

  // Tracks the socket via the special .info/connected node and emits
  // 'connection' ({ connected }) so the scene can show a reconnecting
  // indicator. Firebase reconnects on its own; what it doesn't do is
  // restore presence, so that happens here.
  watchConnection() {
    this.db.ref('.info/serverTimeOffset').on('value', (s) => {
      this.serverTimeOffset = typeof s.val() === 'number' ? s.val() : 0;
    });
    this.db.ref('.info/connected').on('value', (snap) => {
      const connected = snap.val() === true;
      if (connected === this.connected) return;
      this.connected = connected;
      if (connected) {
        const wasReconnect = this.everConnected;
        this.everConnected = true;
        if (wasReconnect && !this.gaveUp) {
          if (this.playerRef) this.armPresence();
          else this.rejoin();
        }
      }
      this.emit('connection', { connected });
    });
  }

  handleSelfGone() {
    if (!this.selfRef || this.gaveUp) return;
    this.playerRef = null;
    this.moveInFlight = false;
    this.pendingMove = null;
    if (this.connected) this.rejoin();
    // otherwise watchConnection() calls rejoin() once we're back online.
  }

  // Recreate our player record under the same id after the server dropped
  // it. Claims a capacity slot again first (the onDisconnect decrement
  // already gave ours back); if the town filled up in the meantime we
  // stay a spectator and tell the scene via 'selfRemoved'.
  async rejoin() {
    if (this.rejoining || this.playerRef || !this.selfRef || this.gaveUp) return;
    this.rejoining = true;
    let claimedSlot = false;
    try {
      const existing = await this.selfRef.once('value');
      if (!existing.exists()) {
        const countResult = await this.playerCountRef.transaction((current) => {
          const n = current || 0;
          if (n >= MAX_PLAYERS) return;
          return n + 1;
        });
        if (!countResult.committed) {
          this.gaveUp = true;
          this.emit('selfRemoved');
          return;
        }
        claimedSlot = true;
        const s = this.state;
        await this.selfRef.set({
          name: s.name,
          species: s.species,
          frame: s.frame,
          x: s.x,
          y: s.y,
          facing: s.facing,
          score: this.localScore || 0,
          emote: null,
          emoteAt: 0,
          title: s.title || null,
          t: firebase.database.ServerValue.TIMESTAMP,
        });
      }
      claimedSlot = false;
      this.playerRef = this.selfRef;
      this.armPresence();
      this.emit('rejoined');
    } catch (e) {
      // Give back a slot we claimed but never occupied, then try again
      // shortly (or on the next .info/connected=true if we're offline).
      if (claimedSlot) {
        this.playerCountRef.transaction((current) => Math.max(0, (current || 0) - 1)).catch(() => {});
      }
      setTimeout(() => { if (this.connected) this.rejoin(); }, 5000);
    } finally {
      this.rejoining = false;
    }
  }

  // Attach the live listeners. child_added fires for every existing player as
  // well as future ones, so it drives both the initial population and joins.
  startListening() {
    this.playersRef.on('child_added', (s) => {
      if (s.key === this.id) return;
      const p = sanitizePlayer(s.key, s.val());
      if (!p) return; // skip broken/zombie records
      this.emit('playerJoined', p);
    });

    this.playersRef.on('child_changed', (s) => {
      if (s.key === this.id) return;
      const p = sanitizePlayer(s.key, s.val());
      if (!p) return;
      this.emit('playerUpdated', p);
    });

    this.playersRef.on('child_removed', (s) => {
      if (s.key === this.id) return;
      this.emit('playerLeft', s.key);
    });

    this.chatRef.limitToLast(30).on('child_added', (s) => {
      // child_added can replay after a reconnect — never show a line twice.
      if (this.seenChatKeys.has(s.key)) return;
      this.seenChatKeys.add(s.key);
      if (this.seenChatKeys.size > 200) {
        this.seenChatKeys.delete(this.seenChatKeys.values().next().value);
      }
      const m = s.val();
      if (!m || typeof m !== 'object') return;
      const text = cleanText(m.text, MAX_CHAT_LEN);
      if (!text) return;
      const t = typeof m.t === 'number' ? m.t : 0;
      const isOld = t < this.joinTime + this.serverTimeOffset;
      if (isOld && this.serverNow() - t > CHAT_MAX_AGE_MS) return;
      this.emit('chat', {
        key: s.key,
        id: typeof m.id === 'string' ? m.id : null,
        name: cleanText(m.name, MAX_NAME_LEN) || '???',
        text,
        isOld,
      });
    });

    this.blocksRef.on('child_added', (s) => {
      const v = s.val();
      if (!v || typeof v !== 'object') return;
      if (!Number.isFinite(v.x) || !Number.isFinite(v.y)) return;
      const pos = clampToWorld(v.x, v.y);
      this.emit('blockAdded', {
        key: s.key,
        x: pos.x,
        y: pos.y,
        type: typeof v.type === 'string' ? v.type.slice(0, 24) : 'wood',
        ownerId: typeof v.ownerId === 'string' ? v.ownerId : null,
      });
    });

    this.blocksRef.on('child_removed', (s) => {
      this.emit('blockRemoved', { key: s.key });
    });

    // Only the most recent 20 notes — this is a shared sign, not a full
    // history browser, so no point loading an unbounded guestbook on join.
    this.guestbookRef.limitToLast(20).on('child_added', (s) => {
      const v = s.val();
      if (!v || typeof v !== 'object') return;
      const text = cleanText(v.text, MAX_NOTE_LEN);
      if (!text) return;
      this.emit('guestbookEntry', {
        key: s.key,
        id: typeof v.id === 'string' ? v.id : null,
        name: cleanText(v.name, MAX_NAME_LEN) || '???',
        text,
        t: typeof v.t === 'number' ? v.t : 0,
      });
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
      this.handleSelfGone();
    }
    return result;
  }

  // At most one position transaction in flight: each one is a full
  // round-trip, so firing them on a timer regardless would pile up a queue
  // on slow connections. Calls made while one is pending just replace the
  // queued target, and the latest one is sent when it settles.
  move(x, y, facing) {
    const pos = clampToWorld(x, y);
    const target = { x: Math.round(pos.x * 10) / 10, y: Math.round(pos.y * 10) / 10, facing: facing === -1 ? -1 : 1 };
    if (this.state) Object.assign(this.state, target);
    if (!this.playerRef) return;
    if (this.moveInFlight) {
      this.pendingMove = target;
      return;
    }
    this.moveInFlight = true;
    this.writeIfAlive((current) => {
      current.x = target.x;
      current.y = target.y;
      current.facing = target.facing;
    }).finally(() => {
      this.moveInFlight = false;
      const next = this.pendingMove;
      this.pendingMove = null;
      if (next) this.move(next.x, next.y, next.facing);
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
    if (this.state) Object.assign(this.state, { species, frame });
    this.writeIfAlive((current) => {
      current.species = species;
      current.frame = frame;
    });
  }

  // Equip an unlocked achievement as a small badge shown next to your name
  // in every client's player list — same sync path as appearance changes.
  // Pass null to unequip.
  updateTitle(achievementId) {
    if (this.state) this.state.title = achievementId || null;
    this.writeIfAlive((current) => {
      current.title = achievementId || null;
    });
  }

  sendChat(text) {
    if (!this.chatRef || !this.id) return;
    const clean = cleanText(text, MAX_CHAT_LEN);
    if (!clean) return;
    this.chatRef.push({
      id: this.id,
      name: cleanText(this.name, MAX_NAME_LEN),
      text: clean,
      t: firebase.database.ServerValue.TIMESTAMP,
    }).catch(() => {});
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
    const clean = cleanText(text, MAX_NOTE_LEN);
    if (!clean) return;
    this.guestbookRef.push({
      id: this.id,
      name: cleanText(this.name, MAX_NAME_LEN),
      text: clean,
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
      const claim = this.cleanClaim(result.snapshot.val());
      return { success: !!(result.committed && claim && claim.id === this.id), claim };
    }).catch(() => ({ success: false, claim: null }));
  }

  watchScavenger(dayKey, callback) {
    if (!this.scavengerRef) return;
    this.scavengerRef.child(String(dayKey)).on('value', (snap) => callback(this.cleanClaim(snap.val())));
  }

  // Daily fishing tournament record: a compare-and-swap transaction, same
  // shape as the scavenger hunt claim, but keyed on "is this catch bigger"
  // instead of "is this the first claim" — the biggest size commits, every
  // smaller/later one aborts without overwriting the real record.
  submitTournamentCatch(dayKey, sizeCm) {
    if (!this.tournamentRef || !this.id) return Promise.resolve({ success: false, record: null });
    return this.tournamentRef.child(String(dayKey)).transaction((current) => {
      // not a new record — abort. A malformed size (string, NaN) counts as
      // "no record" so a junk node can't block the tournament for the day.
      if (current && Number.isFinite(current.size) && current.size >= sizeCm) return;
      return { id: this.id, name: this.name, size: sizeCm, t: Date.now() };
    }).then((result) => {
      const record = this.cleanRecord(result.snapshot.val());
      return { success: !!(result.committed && record && record.id === this.id), record };
    }).catch(() => ({ success: false, record: null }));
  }

  watchTournament(dayKey, callback) {
    if (!this.tournamentRef) return;
    this.tournamentRef.child(String(dayKey)).on('value', (snap) => callback(this.cleanRecord(snap.val())));
  }

  // Any truthy value counts as "claimed" (that's what the transaction
  // checks too), so a malformed claim still hides the marker — it just
  // gets a safe display name.
  cleanClaim(v) {
    if (!v) return null;
    if (typeof v !== 'object') return { id: null, name: 'someone', t: 0 };
    return { ...v, id: typeof v.id === 'string' ? v.id : null, name: cleanClaimName(v.name) };
  }

  cleanRecord(v) {
    if (!v || typeof v !== 'object') return null;
    const size = clampNum(v.size, 0, 999, null);
    if (size === null) return null;
    return { ...v, id: typeof v.id === 'string' ? v.id : null, name: cleanClaimName(v.name), size: Math.round(size) };
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

  // ---------- Realm team play (co-op) ----------
  // Layout (all under the town database, nothing else is touched):
  //   realmInvites/{targetId}/{pushId} = { party, from, fromName, mode, t }   an invitation, deleted by the reader
  //   realmParties/{party}/m = { host, hostName, guest, mode, t }              the lobby record
  //   realmParties/{party}/h = host -> guest snapshots (overwritten ~10x/s)
  //   realmParties/{party}/g = guest -> host input     (overwritten ~15x/s)
  // The host removes the whole party when it leaves or disconnects. Messages are size-capped and rate-limited
  // here, and the receiving side sanitises every field again (see realm-team.js).

  // Someone invites us. cb({ party, from, fromName, mode }) — only well-formed, fresh invites from known ids.
  realmListenInvites(cb) {
    if (!this.db || !this.id) return;
    this.realmInviteRef = this.db.ref(`realmInvites/${this.id}`);
    this.realmInviteRef.on('child_added', (snap) => {
      const v = snap.val();
      snap.ref.remove().catch(() => {}); // an invite is read once
      if (!v || typeof v !== 'object') return;
      const party = typeof v.party === 'string' && /^[-_A-Za-z0-9]{8,40}$/.test(v.party) ? v.party : null;
      const from = typeof v.from === 'string' && /^[-_A-Za-z0-9]{8,40}$/.test(v.from) ? v.from : null;
      const t = clampNum(v.t, 0, Number.MAX_SAFE_INTEGER, 0);
      if (!party || !from || from === this.id) return;
      if (Date.now() - t > 90 * 1000 || t - Date.now() > 60 * 1000) return; // stale (or from a wildly wrong clock)
      cb({ party, from, fromName: cleanText(v.fromName, MAX_NAME_LEN) || 'someone', mode: v.mode === 'duel' ? 'duel' : 'coop' });
    });
  }

  // Open a lobby and invite one player. Returns the party id (the host then waits for realmWatchGuest).
  realmInvite(targetId, mode) {
    if (!this.db || !this.id || typeof targetId !== 'string' || !/^[-_A-Za-z0-9]{8,40}$/.test(targetId) || targetId === this.id) return null;
    if (this.realmRateAt && Date.now() - this.realmRateAt < 3000) return null; // at most one invite every 3 seconds
    this.realmRateAt = Date.now();
    const partyRef = this.db.ref('realmParties').push();
    const party = partyRef.key;
    partyRef.child('m').set({ host: this.id, hostName: cleanText(this.name, MAX_NAME_LEN), guest: null, mode: mode === 'duel' ? 'duel' : 'coop', t: firebase.database.ServerValue.TIMESTAMP }).catch(() => {});
    partyRef.onDisconnect().remove().catch(() => {});
    this.db.ref(`realmInvites/${targetId}`).push({ party, from: this.id, fromName: cleanText(this.name, MAX_NAME_LEN), mode: mode === 'duel' ? 'duel' : 'coop', t: firebase.database.ServerValue.TIMESTAMP }).catch(() => {});
    return party;
  }

  // Host: call cb(guestId) once somebody accepted.
  realmWatchGuest(party, cb) {
    if (!this.db) return () => {};
    const ref = this.db.ref(`realmParties/${party}/m/guest`);
    const fn = (snap) => { const g = snap.val(); if (typeof g === 'string' && /^[-_A-Za-z0-9]{8,40}$/.test(g)) cb(g); };
    ref.on('value', fn);
    return () => ref.off('value', fn);
  }

  // Guest: take the seat. Resolves true when the lobby still existed and the seat was free (a transaction).
  async realmAccept(party) {
    if (!this.db || !this.id || typeof party !== 'string' || !/^[-_A-Za-z0-9]{8,40}$/.test(party)) return false;
    let ref = null; let keep = null;
    try {
      ref = this.db.ref(`realmParties/${party}/m`);
      keep = () => {}; ref.on('value', keep); // hold a listener so the node is cached: a transaction on an unread node first runs against null and would abort
      await ref.once('value');
      const r = await ref.transaction((m) => {
        if (!m || typeof m !== 'object' || m.guest) return; // gone, or somebody else got there first
        m.guest = this.id;
        return m;
      });
      return !!(r.committed && r.snapshot.val());
    } catch (e) { return false; } finally { if (ref && keep) ref.off('value', keep); }
  }

  realmCancel(party) {
    if (!this.db || typeof party !== 'string') return;
    this.db.ref(`realmParties/${party}`).remove().catch(() => {});
  }

  // The two-way channel for a party. send() is rate-limited and size-capped; messages arrive via link.onMessage.
  realmOpenLink(party, role) {
    const out = this.db.ref(`realmParties/${party}/${role === 'host' ? 'h' : 'g'}`);
    const inn = this.db.ref(`realmParties/${party}/${role === 'host' ? 'g' : 'h'}`);
    const cap = role === 'host' ? 24000 : 2500;
    const gap = role === 'host' ? 60 : 40;
    let last = 0; let closed = false;
    const link = {
      onMessage: null,
      send(msg) {
        if (closed || !msg) return;
        const now = Date.now();
        if (msg.k !== 'bye' && now - last < gap) return; // a burst is dropped, the next tick carries the state anyway
        const text = JSON.stringify(msg);
        if (text.length > cap) return;
        last = now;
        out.set(msg).catch(() => {});
      },
      close() {
        if (closed) return;
        closed = true;
        inn.off('value', fn);
        if (role === 'host') this_.realmCancel(party); else out.remove().catch(() => {});
      },
    };
    const this_ = this;
    let seen = false;
    const fn = (snap) => {
      const v = snap.val();
      if (v && typeof v === 'object') { seen = true; if (link.onMessage) link.onMessage(v); } else if (!v && seen && link.onMessage) { seen = false; link.onMessage({ k: 'bye' }); } // the other side's node vanished: they left
    };
    inn.on('value', fn);
    if (role === 'guest') out.onDisconnect().remove().catch(() => {});
    return link;
  }
}
