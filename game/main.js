const FRAME_SIZE = 24;
const FRAME_COUNT = 9;
const HOP_HEIGHT = 5; // px of vertical lift at the peak of a walk hop
const HOP_SPEED = 9; // radians/sec the hop phase advances while moving

// ---------- safety: block slurs in names/chat ----------
// This game's database is intentionally wide-open (see README) so it can
// stay a free, server-less static site — anyone with the link can write
// to it directly over the Firebase REST API, bypassing this client
// entirely. That means this filter can stop an honest player's own typo
// from this page, and can mask an attacker's text once it arrives so it
// doesn't render raw on screen, but it is NOT a security boundary: a
// determined bad actor can still write slurs straight into the database.
// The real fix for that is tightening the Firebase rules (README has the
// steps) and/or adding real auth. Keep the list itself short and specific
// to slurs, not everyday profanity.
const BLOCKED_TERMS = ['nigger', 'nigga', 'faggot', 'retard', 'chink', 'spic', 'kike', 'tranny'];

function normalizeForFilter(s) {
  return String(s)
    .toLowerCase()
    .replace(/4/g, 'a')
    .replace(/3/g, 'e')
    .replace(/1/g, 'i')
    .replace(/!/g, 'i')
    .replace(/0/g, 'o')
    .replace(/5/g, 's')
    .replace(/\$/g, 's')
    .replace(/7/g, 't')
    .replace(/[^a-z]/g, '');
}

function containsBlockedTerm(s) {
  const norm = normalizeForFilter(s);
  return BLOCKED_TERMS.some((term) => norm.includes(term));
}

function censorBlockedTerms(s) {
  if (!containsBlockedTerm(s)) return s;
  // Word-ish tokens get replaced outright rather than character-by-character
  // masked, since leetspeak/spacing tricks mean a partial mask would still
  // read as the slur.
  return String(s)
    .split(/(\s+)/)
    .map((tok) => (containsBlockedTerm(tok) ? '*'.repeat(Math.max(3, tok.length)) : tok))
    .join('');
}

const SPECIES = [
  { key: 'coolcats', label: 'Cats' },
  { key: 'punks', label: 'Punks' },
  { key: 'pudgypenguins', label: 'Penguins' },
  { key: 'doge', label: 'Dogs' },
  { key: 'apes', label: 'Apes' },
  { key: 'zombies', label: 'Zombies' },
  { key: 'mohawks', label: 'Mohawks' },
  { key: 'blondies', label: 'Blondies' },
  { key: 'aliens', label: 'Aliens' },
];

const EMOTES = ['😀', '❤️', '😂', '👋', '🎉'];
const SPARKLE_SPOTS = [
  [500, 300], [1100, 300], [500, 950], [1150, 940], [300, 780],
  [1280, 650], [700, 850], [900, 400], [650, 350], [1050, 950],
  [1750, 450], [2100, 650], [2250, 950],
];
const SPARKLE_ROTATE_MS = 8000;
const SPARKLE_CATCH_RADIUS = 26;

const IS_TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
if (IS_TOUCH) document.body.classList.add('touch-device');

const TILT_DEADZONE_DEG = 8;
const TILT_RANGE_DEG = 36;
const SHAKE_THRESHOLD = 15; // m/s^2 jump in accelerationIncludingGravity magnitude
const SHAKE_COOLDOWN_MS = 800;
const TREE_SHAKE_RADIUS = 46;
const TREE_SHAKE_COOLDOWN_MS = 20000;

// Fixed town layout. WORLD size (2400x1200) is defined in net.js — everyone's
// client draws the same map so landmarks mean the same thing to everyone.
// The original town occupies x:0-1600; x:1600-2400 is the newer "East Meadow"
// zone, reachable by walking east along the main path.
const TREES = [
  [60, 50], [220, 40], [380, 55], [560, 45], [680, 60],
  [920, 60], [1040, 45], [1200, 55], [1360, 40], [1520, 50],
  [60, 1150], [220, 1160], [380, 1145], [560, 1155], [680, 1140],
  [920, 1140], [1040, 1155], [1200, 1145], [1360, 1160], [1520, 1150],
  [40, 180], [50, 320], [40, 880], [55, 1020],
  [1550, 180], [1560, 320], [1540, 460], [1545, 740], [1555, 880], [1540, 1020],
  // East Meadow perimeter
  [1650, 60], [1780, 45], [1900, 55], [2150, 50], [2280, 60], [2370, 45],
  [1650, 1150], [1780, 1160], [1900, 1145], [2050, 1155], [2200, 1140], [2320, 1150],
  [2370, 300], [2370, 500], [2370, 700], [2370, 900],
];
const TULIP_BEDS = [
  { x: 700, y: 520, frames: [0, 1, 2] },
  { x: 900, y: 520, frames: [3, 4, 5] },
  { x: 700, y: 680, frames: [6, 7, 8] },
  { x: 900, y: 680, frames: [0, 3, 6] },
  { x: 1150, y: 900, frames: [1, 4, 7] },
  { x: 1750, y: 850, frames: [2, 5, 8] },
  { x: 2200, y: 950, frames: [0, 4, 7] },
];
const ROCKS = [
  [500, 470, 0], [1080, 470, 3], [500, 730, 5], [1080, 730, 2],
  [760, 460, 1], [840, 460, 4], [300, 900, 6], [1300, 300, 7],
  [1300, 900, 8], [150, 1050, 0],
  [1700, 700, 2], [1950, 950, 5], [2150, 750, 0], [2300, 450, 6],
];
const PUNK_ROCKS = [
  [200, 1000, 1], [1400, 950, 4], [900, 1080, 7], [2050, 480, 2],
];
const POND_CATS = [
  { y: 552, frame: 0, range: [180, 330] },
  { y: 578, frame: 3, range: [150, 300] },
  { y: 648, frame: 6, range: [170, 320] },
];
const STATUE_POS = { x: 1450, y: 600 };
const HOUSE_POS = { x: 1020, y: 760, w: 110, h: 70 };
const SHOP_RADIUS = 70;
const POLYROLL_POS = { x: 1250, y: 760 };
const POLYROLL_RADIUS = 50;
const MUSEUM_POS = { x: 900, y: 920, w: 100, h: 64 };
const MUSEUM_RADIUS = 70;
const FOSSIL_TYPES = ['🦴 T-Rex Bone', '🐚 Ancient Shell', '🦷 Mammoth Tooth', '🥚 Dino Egg', '🪨 Trilobite'];
const FOSSIL_SPOTS = [
  { x: 600, y: 1000 }, { x: 650, y: 1030 }, { x: 700, y: 1000 },
];
const FOSSIL_DIG_RADIUS = 40;
const FOSSIL_RESPAWN_MS = 25000;
const FOSSIL_BAG_CAP = 3;
const DIG_HOLE_POS = { x: 1200, y: 460 };
const DIG_HOLE_RADIUS = 36;
const DOOR_RADIUS = 34;
const TURNIP_STALL_POS = { x: 970, y: 650 };
const TURNIP_STALL_RADIUS = 50;
const TURNIP_BUNDLE = 10;
const TURNIP_BUY_CYCLE_MS = 4 * 60 * 60 * 1000; // buy price changes every 4h
const TURNIP_SELL_CYCLE_MS = 15 * 60 * 1000; // sell price changes every 15min

// Nook Miles-style achievements: lifetime counters (never decrease even
// when the resource is later sold/spent), checked after every relevant
// action. Each unlocks once, ever, per device.
const ACHIEVEMENTS = [
  { id: 'wood10', icon: '🪓', label: 'Lumberjack', desc: 'Chop 10 wood', reward: 5, check: (s) => (s.wood || 0) >= 10 },
  { id: 'stone10', icon: '⛏️', label: 'Miner', desc: 'Mine 10 stone', reward: 5, check: (s) => (s.stone || 0) >= 10 },
  { id: 'fish10', icon: '🐟', label: 'Angler', desc: 'Catch 10 fish', reward: 5, check: (s) => (s.fish || 0) >= 10 },
  { id: 'bugs10', icon: '🦋', label: 'Bug Catcher', desc: 'Catch 10 bugs', reward: 5, check: (s) => (s.bugs || 0) >= 10 },
  { id: 'fruit10', icon: '🍎', label: 'Orchardist', desc: 'Gather 10 fruit', reward: 5, check: (s) => (s.fruit || 0) >= 10 },
  { id: 'blocks10', icon: '🧱', label: 'Builder', desc: 'Place 10 blocks', reward: 5, check: (s) => (s.blocksPlaced || 0) >= 10 },
  { id: 'sparkle10', icon: '✨', label: 'Star Chaser', desc: 'Catch 10 sparkles', reward: 5, check: (s) => (s.sparkles || 0) >= 10 },
  { id: 'polyroll10', icon: '🎲', label: 'High Roller', desc: 'Play Polyroll 10 times', reward: 5, check: (s) => (s.polyrollPlays || 0) >= 10 },
  { id: 'turnipSold', icon: '🥬', label: 'Investor', desc: 'Sell turnips at the shop', reward: 5, check: (s) => (s.turnipsSold || 0) >= 1 },
  { id: 'cave1', icon: '⛰️', label: 'Spelunker', desc: 'Visit the underground cave', reward: 3, check: (s) => (s.caveVisits || 0) >= 1 },
  { id: 'chat10', icon: '👋', label: 'Friendly', desc: 'Send 10 chat messages', reward: 3, check: (s) => (s.chatSent || 0) >= 10 },
  { id: 'museumFull', icon: '🏛️', label: 'Paleontologist', desc: 'Donate all 5 fossil species', reward: 10, check: (s, scene) => scene.museumCollection && scene.museumCollection.size >= FOSSIL_TYPES.length },
];
const CAMPFIRE_POS = { x: 800, y: 600 };
const CAMPFIRE_RADIUS = 60;
// Beachcombing: fixed spots along the pond edges, same pattern as fishing
// spots — a cooldown instead of a respawn timer, no network sync.
const BEACH_ITEMS = ['🐚', '🌊', '⭐'];
const BEACH_SPOTS = [
  { x: 190, y: 510 }, { x: 330, y: 510 }, { x: 170, y: 690 },
  { x: 2000, y: 380 }, { x: 2100, y: 210 },
];
const BEACH_PICKUP_RADIUS = 36;
const BEACH_RESPAWN_MS = 20000;
const ABLE_SISTERS_POS = { x: 1150, y: 650, w: 70, h: 56 };
const ABLE_SISTERS_RADIUS = 55;
const KK_CONCERT_START_HOUR = 19; // 7pm local time
const KK_CONCERT_END_HOUR = 21; // 9pm local time
const WEATHER_CYCLE_MS = 8 * 60 * 1000; // 8-minute weather windows
const WEATHER_RAIN_CHANCE = 0.3; // ~30% of windows are rainy
const WEATHER_RAIN_COUNT = 70;
// One-way, GTA3-loading-door style portals: each is a real door object in
// the town that, on interact, leaves Pixeltown entirely for another
// browser game in this same tab. No teleport back — closing/navigating
// away from the destination is how you return.
const PORTALS = [
  { x: 1500, y: 700, label: '🚪 GTA 3', color: 0x4fa0e0, url: 'https://quenq.com/apps/gta-3/' },
  { x: 2250, y: 600, label: '🚪 GTA 3', color: 0x4fa0e0, url: 'https://quenq.com/apps/gta-3/' },
  { x: 300, y: 500, label: '🚪 NFS Underground 2', color: 0xe0454f, url: 'https://nfsu2.xyz/' },
];
const EAST_POND = { cx: 2000, cy: 280, rx: 130, ry: 80 };

const FISHING_SPOTS = [
  { x: 115, y: 600 },
  { x: 260, y: 700 },
  { x: 2000, y: 170 },
  { x: 1865, y: 280 },
];
const FISH_INTERACT_RADIUS = 36;
const FRUIT_TREE_EVERY = 3;
const BUG_COUNT = 8;
const BUG_CATCH_RADIUS = 40;
const BUG_RESPAWN_MS = 15000;
const ROCK_MINE_RADIUS = 30;
const FISH_BITE_WAIT_MIN = 1800;
const FISH_BITE_WAIT_MAX = 4000;
const FISH_BITE_WINDOW = 1300;

const GRID_SIZE = 32;
const BLOCK_PLACE_DISTANCE = 28;
const BLOCK_CAP = 150;

// ---------------- local save (this device only — nothing here is synced) ----------------

const SAVE_KEY = 'pixeltown-save-v1';

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) || {} : {};
  } catch (e) {
    return {}; // private browsing / storage disabled — just play without saving
  }
}

function writeSave(partial) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...loadSave(), ...partial }));
  } catch (e) {
    // ignore — nothing to persist to
  }
}

class TownScene extends Phaser.Scene {
  constructor() {
    super('Town');
  }

  init(data) {
    this.net = data.net;
    this.selfData = data.self;
    this.world = data.world;
    this.allPlayers = new Map(Object.entries(data.players));
  }

  preload() {
    SPECIES.forEach((s) => {
      this.load.spritesheet(s.key, `../i/${s.key}-strip.png`, {
        frameWidth: FRAME_SIZE,
        frameHeight: FRAME_SIZE,
      });
    });
    this.load.spritesheet('tulips', '../i/tulips-strip.png', { frameWidth: FRAME_SIZE, frameHeight: FRAME_SIZE });
    this.load.spritesheet('rocks', '../i/rocks-strip.png', { frameWidth: FRAME_SIZE, frameHeight: FRAME_SIZE });
    this.load.spritesheet('punkrocks', '../i/punkrocks-strip.png', { frameWidth: FRAME_SIZE, frameHeight: FRAME_SIZE });
    // mooncatrescue-strip.png is the one collection in i/ with no transparency
    // (solid white background baked in) — assets/ holds a chroma-keyed copy
    // just for the game; the original in i/ is left untouched.
    this.load.spritesheet('mooncats', 'assets/mooncats-strip.png', { frameWidth: FRAME_SIZE, frameHeight: FRAME_SIZE });
    this.load.spritesheet('boredapes', '../i/boredapes-strip.png', { frameWidth: 28, frameHeight: 28 });
  }

  create() {
    this.physics.world.setBounds(0, 0, this.world.width, this.world.height);
    this.cameras.main.setBounds(0, 0, this.world.width, this.world.height);
    this.cameras.main.setZoom(2);

    this.obstacles = this.physics.add.staticGroup();
    this.remotePlayers = new Map();

    this.drawGround();
    this.drawPath();
    this.drawPond();
    this.drawPondCats();
    this.drawEastPond();
    this.drawBridge();
    this.drawHouse();
    this.drawStatue();
    this.drawCampfire();
    this.drawDigHole();
    this.drawDoors();
    this.drawPolyrollBooth();
    this.drawMuseum();
    this.drawTurnipStall();
    this.drawAbleSisters();
    this.drawFossilSpots();
    this.drawBeachItems();
    this.drawForestRing();
    this.drawTulipBeds();
    this.drawRocks();
    this.drawPunkRocks();

    this.createLocalPlayer(this.selfData);
    this.physics.add.collider(this.localBody, this.obstacles);

    this.allPlayers.forEach((p) => {
      if (p.id !== this.selfData.id) this.addRemotePlayer(p);
    });

    this.cameras.main.startFollow(this.localBody, true, 0.15, 0.15);

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys('W,A,S,D');
    this.lastSentAt = 0;

    this.setupEmotes();
    this.setupSparkle();
    this.setupDayNight();
    this.kkEnjoyedWindow = loadSave().kkEnjoyedWindow || null;
    this.setupWeather();
    this.setupActivities();
    this.setupBuilding();
    this.setupWalkie();
    this.setupPortalReopen();
    this.setupPolyroll();
    this.setupAchievements();
    this.setupAchievementsUI();
    this.setupOutfitShop();
    this.setupBugs();
    this.setupFossils();
    if (IS_TOUCH) {
      this.setupTouchControls();
      this.setupTiltShake();
    }

    this.registerNetHandlers();
    this.registerChatUI();
    this.renderPlayerList();

    // Handlers are wired up — safe to start receiving live updates now.
    this.net.startListening();
  }

  update(time, delta) {
    this.updateLocalMovement(time, delta);
    this.updateRemoteInterpolation(delta);
    this.updateSparkle(time);
    this.updateDayNight(time);
    this.updateConcert(time);
    this.updateWeather(time, delta);
    this.updateTurnipPriceLabels(time);
    this.updateBuildPreview();
    this.updateFishingRod();
    this.updateDigHoleHint();
  }

  // ---------- movement ----------

  updateLocalMovement(time, delta) {
    const speed = 140;
    let vx = 0;
    let vy = 0;

    if (!this.chatFocused && !this.polyrollOpen && !this.achievementsOpen && !this.outfitShopOpen) {
      if (this.cursors.left.isDown || this.wasd.A.isDown) vx -= 1;
      if (this.cursors.right.isDown || this.wasd.D.isDown) vx += 1;
      if (this.cursors.up.isDown || this.wasd.W.isDown) vy -= 1;
      if (this.cursors.down.isDown || this.wasd.S.isDown) vy += 1;

      if (this.touchMove) {
        vx += this.touchMove.x;
        vy += this.touchMove.y;
      }
      if (this.tiltEnabled && this.tiltMove) {
        vx += this.tiltMove.x;
        vy += this.tiltMove.y;
      }
    }

    const mag = Math.hypot(vx, vy);
    if (mag > 1) {
      vx /= mag;
      vy /= mag;
    }

    // Walking away mid-cast used to just let the rod stay drawn to a spot
    // you'd left, with no feedback — now moving away cancels the cast
    // outright, same as leaving real Animal Crossing's fishing animation.
    if (mag > 0 && this.fishing && this.fishing.state !== 'idle') {
      this.showFloatingText(this.fishing.spot.x, this.fishing.spot.y - 24, 'left the line');
      this.endFishing();
    }

    this.localBody.body.setVelocity(vx * speed, vy * speed);
    if (vx !== 0) this.localVisual.setFlipX(vx < 0);

    const moving = vx !== 0 || vy !== 0;
    this.applyBob(this.localBobState, this.localVisual, this.localShadow, this.localBody.x, this.localBody.y, moving, delta);
    this.localNameText.setPosition(this.localBody.x, this.localVisual.y - 22);

    if (time - this.lastSentAt > 100) {
      this.lastSentAt = time;
      this.net.move(this.localBody.x, this.localBody.y, this.localVisual.flipX ? -1 : 1);
    }
  }

  updateRemoteInterpolation(delta) {
    this.remotePlayers.forEach((rp) => {
      const prevX = rp.x;
      const prevY = rp.y;
      rp.x += (rp.targetX - rp.x) * 0.25;
      rp.y += (rp.targetY - rp.y) * 0.25;
      rp.visual.setFlipX(rp.facing === -1);

      const moving = Math.hypot(rp.x - prevX, rp.y - prevY) > 0.05;
      this.applyBob(rp.bob, rp.visual, rp.shadow, rp.x, rp.y, moving, delta);
      rp.nameText.setPosition(rp.x, rp.visual.y - 22);
      if (rp.bubble) rp.bubble.setPosition(rp.x, rp.visual.y - 40);
    });
  }

  // ---------- walk-cycle (squash/stretch hop, since the source sprites are single-pose) ----------

  applyBob(state, visual, shadow, anchorX, anchorY, moving, delta) {
    if (moving) {
      state.phase += (delta / 1000) * HOP_SPEED;
      const target = Math.abs(Math.sin(state.phase));
      state.lift += (target - state.lift) * 0.6;
    } else {
      state.phase = 0;
      state.lift += (0 - state.lift) * 0.3;
    }

    visual.x = anchorX;
    visual.y = anchorY - state.lift * HOP_HEIGHT;
    visual.setScale(1 - state.lift * 0.07, 1 + state.lift * 0.12);
    visual.setDepth(anchorY);

    shadow.x = anchorX;
    shadow.y = anchorY + 9;
    const shrink = 1 - state.lift * 0.35;
    shadow.setScale(shrink, shrink);
  }

  // ---------- emotes ----------

  setupEmotes() {
    this.lastEmoteAt = new Map(); // playerId -> last emoteAt we've already shown
    this.input.keyboard.on('keydown', (e) => {
      if (this.chatFocused) return;
      const i = Number(e.key) - 1;
      this.triggerEmote(i);
    });
  }

  triggerEmote(i) {
    if (i < 0 || i >= EMOTES.length) return;
    this.net.emote(EMOTES[i]);
    this.showEmoteBubble(this.selfData.id, EMOTES[i]);
  }

  showEmoteBubble(playerId, symbol) {
    const anchor = playerId === this.selfData.id
      ? this.localVisual
      : (this.remotePlayers.get(playerId) || {}).visual;
    if (!anchor) return;

    const bubble = this.add.text(anchor.x, anchor.y - 34, symbol, { fontSize: '20px' })
      .setOrigin(0.5)
      .setDepth(100001);
    this.tweens.add({
      targets: bubble,
      y: bubble.y - 14,
      alpha: { from: 1, to: 0 },
      duration: 1400,
      onComplete: () => bubble.destroy(),
    });
  }

  // ---------- sparkle minigame ----------
  // The active spot is derived from wall-clock time, so every client agrees
  // on where it is without any extra network traffic. Anyone nearby when it
  // rotates scores a point — casual and co-op, not first-click-wins.

  setupSparkle() {
    this.sparkleIndex = -1;
    this.sparkleCaught = false;
    this.sparkleStar = this.add.star(0, 0, 5, 6, 12, 0xfff2a8).setDepth(200001).setVisible(false);
    this.sparkleGlow = this.add.star(0, 0, 5, 9, 18, 0xffe066, 0.35).setDepth(200000).setVisible(false);
    this.tweens.add({
      targets: [this.sparkleStar, this.sparkleGlow],
      angle: 360,
      duration: 4000,
      repeat: -1,
    });
    this.localScore = 0;
  }

  updateSparkle(time) {
    const index = Math.floor(time / SPARKLE_ROTATE_MS) % SPARKLE_SPOTS.length;
    if (index !== this.sparkleIndex) {
      this.sparkleIndex = index;
      this.sparkleCaught = false;
      const [x, y] = SPARKLE_SPOTS[index];
      this.sparkleStar.setPosition(x, y).setVisible(true);
      this.sparkleGlow.setPosition(x, y).setVisible(true);
    }

    if (this.sparkleCaught) return;
    const [sx, sy] = SPARKLE_SPOTS[this.sparkleIndex];
    if (Math.hypot(this.localBody.x - sx, this.localBody.y - sy) < SPARKLE_CATCH_RADIUS) {
      this.sparkleCaught = true;
      this.awardPoint(1, '+1 ⭐', this.localBody.x, this.localBody.y - 30);
      this.incrementStat('sparkles');
    }
  }

  awardPoint(amount, label, x, y) {
    this.localScore += amount;
    this.net.addScore(amount);
    const mine = this.allPlayers.get(this.selfData.id);
    if (mine) mine.score = this.localScore;
    this.renderPlayerList();
    this.showFloatingText(x, y, label);
  }

  showFloatingText(x, y, text) {
    const t = this.add.text(x, y, text, {
      fontSize: '13px',
      fontFamily: 'monospace',
      color: '#ffe066',
      stroke: '#1c2430',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(100002);
    this.tweens.add({ targets: t, y: y - 24, alpha: { from: 1, to: 0 }, duration: 900, onComplete: () => t.destroy() });
  }

  // ---------- day/night ambience ----------

  setupDayNight() {
    this.dayNightOverlay = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x0a1030, 0)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(300000);
    this.scale.on('resize', (size) => this.dayNightOverlay.setSize(size.width, size.height));
    this.lastDayNightCheck = 0;
  }

  // ---------- weather ----------
  // Deterministic from wall-clock time, same trick as the sparkle: every
  // client hashes the current 8-minute window the same way, so rain
  // starts/stops in sync without any network traffic. Purely cosmetic —
  // nothing about gameplay changes while it rains.

  setupWeather() {
    this.rainDrops = [];
    for (let i = 0; i < WEATHER_RAIN_COUNT; i++) {
      const d = this.add.rectangle(0, 0, 2, 16, 0xcfe9ff, 0.45)
        .setScrollFactor(0)
        .setDepth(300001)
        .setVisible(false);
      d.vy = Phaser.Math.Between(320, 460);
      this.rainDrops.push(d);
    }
    this.isRaining = null; // unknown yet, forces the first check to apply
  }

  isRainWindow(now) {
    const bucket = Math.floor(now / WEATHER_CYCLE_MS);
    const h = Math.sin(bucket * 12.9898) * 43758.5453;
    return (h - Math.floor(h)) < WEATHER_RAIN_CHANCE;
  }

  updateWeather(time, delta) {
    const raining = this.isRainWindow(Date.now());
    if (raining !== this.isRaining) {
      const wasKnown = this.isRaining !== null;
      this.isRaining = raining;
      this.rainDrops.forEach((d) => {
        d.setVisible(raining);
        if (raining) d.setPosition(Phaser.Math.Between(0, this.scale.width), Phaser.Math.Between(0, this.scale.height));
      });
      if (wasKnown) this.addChatLine({ system: true, text: raining ? '🌧️ it started raining' : '☀️ the rain cleared up' });
    }
    if (!raining) return;
    const w = this.scale.width;
    const h = this.scale.height;
    this.rainDrops.forEach((d) => {
      d.y += d.vy * (delta / 1000);
      d.x -= 40 * (delta / 1000);
      if (d.y > h) { d.y = -10; d.x = Phaser.Math.Between(0, w); }
      if (d.x < -10) d.x = w + 10;
    });
  }

  updateDayNight(time) {
    if (time - this.lastDayNightCheck < 1000) return;
    this.lastDayNightCheck = time;

    const now = new Date();
    const hour = now.getHours() + now.getMinutes() / 60;
    let night;
    if (hour >= 20 || hour < 5) night = 1;
    else if (hour >= 18) night = (hour - 18) / 2;
    else if (hour < 7) night = 1 - (hour - 5) / 2;
    else night = 0;

    this.dayNightOverlay.setAlpha(night * 0.45);
  }

  // ---------- mobile: virtual D-pad + action buttons ----------

  setupTouchControls() {
    this.touchMove = { x: 0, y: 0 };
    const pressed = new Set();
    const recompute = () => {
      let x = 0;
      let y = 0;
      if (pressed.has('up')) y -= 1;
      if (pressed.has('down')) y += 1;
      if (pressed.has('left')) x -= 1;
      if (pressed.has('right')) x += 1;
      this.touchMove = { x, y };
    };

    document.querySelectorAll('.dpad-btn').forEach((btn) => {
      const dir = btn.dataset.dir;
      const start = (e) => { e.preventDefault(); pressed.add(dir); btn.classList.add('active'); recompute(); };
      const end = (e) => { if (e.cancelable) e.preventDefault(); pressed.delete(dir); btn.classList.remove('active'); recompute(); };
      btn.addEventListener('touchstart', start, { passive: false });
      btn.addEventListener('touchend', end);
      btn.addEventListener('touchcancel', end);
      btn.addEventListener('mousedown', start);
      btn.addEventListener('mouseup', end);
      btn.addEventListener('mouseleave', end);
    });

    const chatInput = document.getElementById('chat-input');
    document.getElementById('chat-send-btn').addEventListener('click', () => this.sendChatMessage());
    document.getElementById('mobile-chat-btn').addEventListener('click', () => chatInput.focus());

    const emotePopup = document.getElementById('emote-popup');
    EMOTES.forEach((symbol, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = symbol;
      btn.addEventListener('click', () => {
        this.triggerEmote(i);
        emotePopup.classList.add('hidden');
      });
      emotePopup.appendChild(btn);
    });
    document.getElementById('emote-toggle-btn').addEventListener('click', () => {
      emotePopup.classList.toggle('hidden');
    });
  }

  // ---------- mobile: tilt steering + shake-to-interact ----------
  // iOS requires DeviceOrientation/DeviceMotion permission from a real tap,
  // so this only activates when the player presses the Tilt button.

  setupTiltShake() {
    this.tiltEnabled = false;
    this.tiltMove = { x: 0, y: 0 };
    this.tiltBaseline = null;
    this.lastAccelMag = null;
    this.lastShakeAt = 0;
    this.tiltPermissionGranted = false;
    this.boundOnDeviceOrientation = (e) => this.onDeviceOrientation(e);
    this.boundOnDeviceMotion = (e) => this.onDeviceMotion(e);

    const hasOrientation = typeof window.DeviceOrientationEvent !== 'undefined';
    const btn = document.getElementById('tilt-toggle-btn');
    if (!hasOrientation) {
      btn.style.display = 'none';
      return;
    }

    btn.addEventListener('click', () => this.toggleTilt(btn));
  }

  async toggleTilt(btn) {
    if (this.tiltEnabled) {
      this.tiltEnabled = false;
      this.tiltMove = { x: 0, y: 0 };
      window.removeEventListener('deviceorientation', this.boundOnDeviceOrientation);
      window.removeEventListener('devicemotion', this.boundOnDeviceMotion);
      btn.classList.remove('enabled');
      btn.textContent = '🎮 Tilt';
      return;
    }

    if (!this.tiltPermissionGranted) {
      try {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
          const res = await DeviceOrientationEvent.requestPermission();
          if (res !== 'granted') {
            this.addChatLine({ system: true, text: 'Tilt controls need motion access — check Settings > Safari > Motion & Orientation Access.' });
            return;
          }
        }
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
          await DeviceMotionEvent.requestPermission();
        }
      } catch (e) {
        // Non-iOS browsers don't need permission — fall through and enable anyway.
      }
      this.tiltPermissionGranted = true;
    }

    this.tiltEnabled = true;
    this.tiltBaseline = null;
    btn.classList.add('enabled');
    btn.textContent = '🎮 Tilt ✓';

    window.addEventListener('deviceorientation', this.boundOnDeviceOrientation);
    window.addEventListener('devicemotion', this.boundOnDeviceMotion);
  }

  onDeviceOrientation(e) {
    if (!this.tiltEnabled) return;
    if (this.tiltBaseline === null) {
      this.tiltBaseline = { beta: e.beta || 0, gamma: e.gamma || 0 };
      return;
    }
    const dGamma = (e.gamma || 0) - this.tiltBaseline.gamma; // left/right lean
    const dBeta = (e.beta || 0) - this.tiltBaseline.beta; // forward/back lean
    this.tiltMove = {
      x: this.applyDeadzone(dGamma),
      y: this.applyDeadzone(dBeta),
    };
  }

  applyDeadzone(v) {
    const sign = Math.sign(v);
    const mag = Math.max(0, Math.abs(v) - TILT_DEADZONE_DEG);
    return sign * Math.min(1, mag / (TILT_RANGE_DEG - TILT_DEADZONE_DEG));
  }

  onDeviceMotion(e) {
    if (!this.tiltEnabled) return;
    const a = e.accelerationIncludingGravity || e.acceleration;
    if (!a || a.x === null) return;

    const mag = Math.sqrt((a.x || 0) ** 2 + (a.y || 0) ** 2 + (a.z || 0) ** 2);
    if (this.lastAccelMag !== null) {
      const jump = Math.abs(mag - this.lastAccelMag);
      const now = Date.now();
      if (jump > SHAKE_THRESHOLD && now - this.lastShakeAt > SHAKE_COOLDOWN_MS) {
        this.lastShakeAt = now;
        this.onShake();
      }
    }
    this.lastAccelMag = mag;
  }

  // Shake is just a fun alternate trigger for the same interact() logic used
  // by the desktop 'E' key and the mobile Interact button.
  onShake() {
    this.interact();
  }

  shakeTreeVisual(index) {
    const g = this.treeGraphics[index];
    if (!g) return;
    this.tweens.add({
      targets: g,
      angle: { from: -6, to: 6 },
      duration: 70,
      yoyo: true,
      repeat: 5,
      onComplete: () => g.setAngle(0),
    });
  }

  // ---------- activities: chop / mine / fish ----------
  // One shared action (desktop 'E', mobile Interact button, or a shake) that
  // figures out what's nearby and does the relevant thing. Wood/stone/fish
  // are a separate inventory from the sparkle leaderboard score — they only
  // feed the building system below.

  setupActivities() {
    const saved = loadSave().resources || {};
    this.resources = {
      wood: Number(saved.wood) || 0,
      stone: Number(saved.stone) || 0,
      fish: Number(saved.fish) || 0,
      bugs: Number(saved.bugs) || 0,
      fruit: Number(saved.fruit) || 0,
      turnips: Number(saved.turnips) || 0,
      shells: Number(saved.shells) || 0,
    };
    this.treeCooldowns = {};
    this.rockCooldowns = {};
    this.fishing = { state: 'idle', spot: null, bobber: null, timer: null };
    this.updateInventoryHUD();

    this.input.keyboard.on('keydown-E', () => { if (!this.chatFocused && !this.polyrollOpen && !this.achievementsOpen && !this.outfitShopOpen) this.interact(); });
    const btn = document.getElementById('interact-btn');
    if (btn) btn.addEventListener('click', () => this.interact());
  }

  saveResources() {
    writeSave({ resources: this.resources });
  }

  interact() {
    if (this.inUnderground) return;
    if (this.buildMode) {
      this.handleBuildInteract();
      return;
    }
    if (this.fishing.state !== 'idle') {
      this.handleFishingInteract();
      return;
    }
    if (this.isNearAbleSisters()) {
      this.openOutfitShop();
      return;
    }
    if (this.isNearCampfire() && this.isConcertTime()) {
      this.enjoyConcert();
      return;
    }
    if (this.isNearShop()) {
      this.sellAtShop();
      return;
    }
    if (this.isNearPolyroll()) {
      this.openPolyroll();
      return;
    }
    if (this.isNearTurnipStall()) {
      this.buyTurnips();
      return;
    }
    if (this.isNearMuseum()) {
      this.donateFossils();
      return;
    }
    const fossilSpot = this.findNearestFossilSpot();
    if (fossilSpot) {
      this.digFossil(fossilSpot);
      return;
    }
    const beachSpot = this.findNearestBeachItem();
    if (beachSpot) {
      this.collectBeachItem(beachSpot);
      return;
    }
    if (this.isNearDigHole()) {
      this.enterUnderground();
      return;
    }

    if (this.isNearDoor()) {
      this.useDoor();
      return;
    }

    const bug = this.findNearestBug();
    if (bug) {
      this.swingTool('🥍');
      this.catchBug(bug);
      return;
    }

    const tree = this.findNearestTree();
    if (tree) {
      this.treeCooldowns[tree.index] = Date.now();
      this.shakeTreeVisual(tree.index);
      this.swingTool('🪓');
      this.gainResource('wood', 1, tree.x, tree.y - 40);
      const fruit = this.treeFruit[tree.index];
      if (fruit) {
        fruit.setVisible(false);
        this.gainResource('fruit', 1, tree.x, tree.y - 58);
        this.time.delayedCall(TREE_SHAKE_COOLDOWN_MS, () => fruit.setVisible(true));
      }
      return;
    }

    const rock = this.findNearestRock();
    if (rock) {
      this.rockCooldowns[rock.key] = Date.now();
      this.swingTool('⛏️');
      this.gainResource('stone', 1, rock.x, rock.y - 20);
      return;
    }

    const spot = this.findNearestFishingSpot();
    if (spot) {
      this.startFishing(spot);
      return;
    }

    this.triggerEmote(Math.floor(Math.random() * EMOTES.length));
  }

  // ---------- shop (classic AC "sell your stuff" loop) ----------

  isNearShop() {
    const cx = HOUSE_POS.x + HOUSE_POS.w / 2;
    const cy = HOUSE_POS.y + HOUSE_POS.h / 2;
    return Math.hypot(this.localBody.x - cx, this.localBody.y - cy) < SHOP_RADIUS;
  }

  drawPolyrollBooth() {
    const { x, y } = POLYROLL_POS;
    const g = this.add.graphics().setDepth(y - 1);
    g.fillStyle(0x6b2e3a, 1).fillRect(x - 28, y - 10, 56, 26);
    g.fillStyle(0xffffff, 1).fillRect(x - 24, y - 6, 48, 18);
    g.fillStyle(0x1c2430, 1);
    [[-14, -1], [0, 2], [14, -2]].forEach(([dx, dy]) => g.fillCircle(x + dx, y + dy, 2));
    this.add.text(x, y - 36, '🎲 Polyroll', { fontSize: '13px' }).setOrigin(0.5).setDepth(y + 1);
  }

  isNearPolyroll() {
    return Math.hypot(this.localBody.x - POLYROLL_POS.x, this.localBody.y - POLYROLL_POS.y) < POLYROLL_RADIUS;
  }

  // ---------- Polyroll: a dice/coin betting minigame, stars-only ----------
  // Inspired by a dice/coin-flip betting game — no wallet, no crypto, no
  // real money anywhere in this. The only stake is your own ⭐ score,
  // same currency the sparkle and the shop already use.

  openPolyroll() {
    if (this.inUnderground) return;
    this.polyrollOpen = true;
    document.getElementById('polyroll-overlay').classList.remove('hidden');
    this.updatePolyrollScoreLabel();
  }

  closePolyroll() {
    this.polyrollOpen = false;
    document.getElementById('polyroll-overlay').classList.add('hidden');
  }

  updatePolyrollScoreLabel() {
    const el = document.getElementById('polyroll-score');
    if (el) el.textContent = this.localScore || 0;
  }

  playPolyrollDice(pick, bet) {
    const roll = Phaser.Math.Between(1, 6);
    const win = roll === pick;
    const delta = win ? bet * 5 : -bet;
    this.resolvePolyroll(`🎲 rolled ${roll}`, win, delta);
  }

  playPolyrollCoin(pick, bet) {
    const flip = Math.random() < 0.5 ? 'heads' : 'tails';
    const win = flip === pick;
    const delta = win ? bet : -bet;
    this.resolvePolyroll(`🪙 landed on ${flip}`, win, delta);
  }

  resolvePolyroll(rollText, win, delta) {
    this.awardPoint(delta, `${win ? 'won' : 'lost'} ${Math.abs(delta)} ⭐`, this.localBody.x, this.localBody.y - 30);
    const resultEl = document.getElementById('polyroll-result');
    resultEl.textContent = `${rollText} — you ${win ? 'won' : 'lost'} ${Math.abs(delta)} ⭐!`;
    resultEl.className = win ? 'win' : 'lose';
    this.updatePolyrollScoreLabel();
    this.incrementStat('polyrollPlays');
  }

  setupPolyroll() {
    this.polyrollMode = 'dice';
    this.polyrollDicePick = 1;
    this.polyrollCoinPick = 'heads';

    document.getElementById('polyroll-close-btn').addEventListener('click', () => this.closePolyroll());

    const diceTab = document.getElementById('polyroll-tab-dice');
    const coinTab = document.getElementById('polyroll-tab-coin');
    const dicePanel = document.getElementById('polyroll-dice-panel');
    const coinPanel = document.getElementById('polyroll-coin-panel');
    diceTab.addEventListener('click', () => {
      this.polyrollMode = 'dice';
      diceTab.classList.add('active');
      coinTab.classList.remove('active');
      dicePanel.classList.remove('hidden');
      coinPanel.classList.add('hidden');
    });
    coinTab.addEventListener('click', () => {
      this.polyrollMode = 'coin';
      coinTab.classList.add('active');
      diceTab.classList.remove('active');
      coinPanel.classList.remove('hidden');
      dicePanel.classList.add('hidden');
    });

    document.querySelectorAll('#polyroll-dice-picker .polyroll-pick').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.polyrollDicePick = Number(btn.dataset.num);
        document.querySelectorAll('#polyroll-dice-picker .polyroll-pick').forEach((b) => b.classList.toggle('active', b === btn));
      });
    });
    document.querySelectorAll('#polyroll-coin-picker .polyroll-pick').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.polyrollCoinPick = btn.dataset.side;
        document.querySelectorAll('#polyroll-coin-picker .polyroll-pick').forEach((b) => b.classList.toggle('active', b === btn));
      });
    });

    document.getElementById('polyroll-play-btn').addEventListener('click', () => {
      const betInput = document.getElementById('polyroll-bet');
      const score = this.localScore || 0;
      let bet = Math.floor(Number(betInput.value));
      if (!Number.isFinite(bet) || bet < 1) bet = 1;
      if (bet > score) bet = score;
      betInput.value = bet;
      if (score <= 0 || bet < 1) {
        document.getElementById('polyroll-result').textContent = "you don't have any ⭐ to bet";
        document.getElementById('polyroll-result').className = 'lose';
        return;
      }
      if (this.polyrollMode === 'dice') this.playPolyrollDice(this.polyrollDicePick, bet);
      else this.playPolyrollCoin(this.polyrollCoinPick, bet);
    });
  }

  sellAtShop() {
    const total = (this.resources.wood || 0) + (this.resources.stone || 0) + (this.resources.fish || 0) + (this.resources.bugs || 0) + (this.resources.fruit || 0) + (this.resources.shells || 0);
    const turnipRevenue = (this.resources.turnips || 0) > 0 ? this.resources.turnips * this.turnipSellPrice() / TURNIP_BUNDLE : 0;
    const grandTotal = Math.round(total + turnipRevenue);
    if (grandTotal === 0) {
      this.showFloatingText(this.localBody.x, this.localBody.y - 30, 'bag is empty');
      return;
    }
    const soldTurnips = this.resources.turnips || 0;
    this.resources = { wood: 0, stone: 0, fish: 0, bugs: 0, fruit: 0, turnips: 0, shells: 0 };
    this.updateInventoryHUD();
    this.saveResources();
    const label = soldTurnips > 0 ? `sold (incl. ${soldTurnips} 🥬)! +${grandTotal} ⭐` : `sold! +${grandTotal} ⭐`;
    this.awardPoint(grandTotal, label, this.localBody.x, this.localBody.y - 30);
    if (soldTurnips > 0) this.incrementStat('turnipsSold', soldTurnips);
  }

  // ---------- turnip / stalk market ----------
  // A simplified, single-session take on Animal Crossing's stalk market:
  // buy a bundle from the merchant stall at a price that drifts every 4
  // real-world hours, sell at the shop at a price that swings far more
  // (every 15 minutes) — sometimes a profit, sometimes a loss, same
  // deterministic wall-clock-hash trick as weather/the sparkle, so it
  // needs no network traffic and no persistent "day" concept.

  turnipHashedPrice(cycleMs, seedOffset, min, max) {
    const bucket = Math.floor(Date.now() / cycleMs) + seedOffset;
    const h = Math.sin(bucket * 12.9898) * 43758.5453;
    const frac = h - Math.floor(h);
    return Math.round(min + frac * (max - min));
  }

  turnipBuyPrice() {
    return this.turnipHashedPrice(TURNIP_BUY_CYCLE_MS, 1000, 90, 130);
  }

  turnipSellPrice() {
    return this.turnipHashedPrice(TURNIP_SELL_CYCLE_MS, 7000, 20, 240);
  }

  isNearTurnipStall() {
    return Math.hypot(this.localBody.x - TURNIP_STALL_POS.x, this.localBody.y - TURNIP_STALL_POS.y) < TURNIP_STALL_RADIUS;
  }

  buyTurnips() {
    const price = this.turnipBuyPrice();
    if ((this.localScore || 0) < price) {
      this.showFloatingText(this.localBody.x, this.localBody.y - 30, `need ${price} ⭐ for ${TURNIP_BUNDLE} turnips`);
      return;
    }
    this.resources.turnips = (this.resources.turnips || 0) + TURNIP_BUNDLE;
    this.updateInventoryHUD();
    this.saveResources();
    this.awardPoint(-price, `bought ${TURNIP_BUNDLE} 🥬 for ${price} ⭐`, this.localBody.x, this.localBody.y - 30);
  }

  // ---------- underground (3D voxel cave, local-only) ----------

  isNearDigHole() {
    return Math.hypot(this.localBody.x - DIG_HOLE_POS.x, this.localBody.y - DIG_HOLE_POS.y) < DIG_HOLE_RADIUS;
  }

  // These doors are one-way, GTA3-loading-door style: they leave Pixeltown
  // entirely for another browser game in this same tab. There's no
  // teleport back — closing/navigating away from that page is how you
  // return, same as actually walking through a loading door and leaving
  // the area behind. Always confirm first since this abandons the
  // current session.
  findNearestPortal() {
    let best = null;
    let bestDist = DOOR_RADIUS;
    PORTALS.forEach((p) => {
      const d = Math.hypot(this.localBody.x - p.x, this.localBody.y - p.y);
      if (d < bestDist) { bestDist = d; best = p; }
    });
    return best;
  }

  isNearDoor() {
    return !!this.findNearestPortal();
  }

  useDoor() {
    if (this.doorBusy) return;
    const portal = this.findNearestPortal();
    if (!portal) return;
    const name = portal.label.replace('🚪', '').trim();
    const ok = window.confirm(`Walk through the portal to ${name}? This leaves Pixeltown in this tab — there's no way back through it.`);
    if (!ok) return;
    this.doorBusy = true;
    window.location.href = portal.url;
  }

  // If the player presses the browser's Back button after going through a
  // portal, some browsers (iOS Safari especially) restore this exact page
  // from cache instead of reloading it — doorBusy would otherwise stay
  // stuck true forever, since it was only ever set right before leaving,
  // making every door permanently dead until a hard refresh. Clear it
  // whenever the page becomes active again, covering both that restore
  // and an ordinary fresh load (where it's already false, so this is a
  // no-op).
  setupPortalReopen() {
    window.addEventListener('pageshow', () => { this.doorBusy = false; });
  }

  updateDigHoleHint() {
    const hint = document.getElementById('dig-hole-hint');
    if (!hint) return;
    hint.classList.toggle('hidden', this.inUnderground || this.buildMode || !this.isNearDigHole());
  }

  enterUnderground() {
    if (this.inUnderground) return;
    this.inUnderground = true;
    this.incrementStat('caveVisits');
    document.getElementById('dig-hole-hint').classList.add('hidden');
    document.getElementById('hud').classList.add('hidden');
    const overlay = document.getElementById('underground-overlay');
    overlay.classList.remove('hidden');
    this.scene.pause();

    if (!this.underground) {
      const onResourceChange = () => { this.updateInventoryHUD(); this.saveResources(); };
      this.underground = new UndergroundWorld({
        canvasWrap: document.getElementById('underground-canvas-wrap'),
        resources: this.resources,
        onResourceChange,
        onExit: () => this.exitUnderground(),
      });
      this.underground.setAvatar(`../i/${this.selfData.species}-strip.png`, this.selfData.frame || 0, FRAME_SIZE);
      this.setupUndergroundControls();
    }
    this.underground.start();
  }

  exitUnderground() {
    if (!this.inUnderground) return;
    this.inUnderground = false;
    this.underground.stop();
    document.getElementById('underground-overlay').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    this.scene.resume();
  }

  // Exit always works, from anywhere in the cave, the moment you press it —
  // no need to navigate back to the shaft. The old "only near the surface"
  // gate made getting out feel broken, since the cave is a maze you can
  // get turned around in. Mining keeps its own separate key/button so the
  // two actions are never ambiguous.
  // Keeps the on-screen hotbar buttons' highlight in sync with whichever
  // slot Place will actually use.
  setUgHotbar(type) {
    this.underground.setHotbar(type);
    document.getElementById('ug-hotbar-wall').classList.toggle('active', type === 'wall');
    document.getElementById('ug-hotbar-torch').classList.toggle('active', type === 'torch');
  }

  setupUndergroundControls() {
    const ug = this.underground;
    this.input.keyboard && window.addEventListener('keydown', (e) => {
      if (!this.inUnderground) return;
      const k = e.key.toLowerCase();
      if (k === 'e') {
        ug.mine();
      } else if (k === 'f') {
        ug.place();
      } else if (k === '1') {
        this.setUgHotbar('wall');
      } else if (k === '2') {
        this.setUgHotbar('torch');
      } else if (k === 'escape' || k === 'backspace') {
        this.exitUnderground();
      }
    });

    const setDir = (dir, on) => {
      const v = on ? 1 : 0;
      if (dir === 'up') this.ugFwd = v;
      if (dir === 'down') this.ugFwd = -v;
      if (dir === 'left') this.ugStrafe = -v;
      if (dir === 'right') this.ugStrafe = v;
      ug.setMoveInput(this.ugFwd || 0, this.ugStrafe || 0);
    };
    document.querySelectorAll('#ug-dpad .dpad-btn').forEach((btn) => {
      const dir = btn.dataset.ugdir;
      btn.addEventListener('pointerdown', (e) => { e.preventDefault(); setDir(dir, true); });
      btn.addEventListener('pointerup', () => setDir(dir, false));
      btn.addEventListener('pointerleave', () => setDir(dir, false));
    });

    const setVert = (v) => { ug.setMoveInput(this.ugFwd || 0, this.ugStrafe || 0, v); };
    const upBtn = document.getElementById('ug-up-btn');
    const downBtn = document.getElementById('ug-down-btn');
    upBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); setVert(1); });
    upBtn.addEventListener('pointerup', () => setVert(0));
    upBtn.addEventListener('pointerleave', () => setVert(0));
    downBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); setVert(-1); });
    downBtn.addEventListener('pointerup', () => setVert(0));
    downBtn.addEventListener('pointerleave', () => setVert(0));

    document.getElementById('ug-mine-btn').addEventListener('click', () => ug.mine());
    document.getElementById('ug-place-btn').addEventListener('click', () => ug.place());
    document.getElementById('ug-exit-btn').addEventListener('click', () => this.exitUnderground());
    document.getElementById('ug-hotbar-wall').addEventListener('click', () => this.setUgHotbar('wall'));
    document.getElementById('ug-hotbar-torch').addEventListener('click', () => this.setUgHotbar('torch'));

    this._ugExitHintInterval = setInterval(() => {
      if (!this.inUnderground) return;
      document.getElementById('underground-exit-hint').classList.toggle('hidden', !ug.nearExit);
    }, 150);
  }

  // Briefly shows the tool in the villager's hand and swings it.
  swingTool(symbol) {
    const dir = this.localVisual.flipX ? -1 : 1;
    const tool = this.add.text(this.localBody.x + dir * 12, this.localBody.y - 4, symbol, { fontSize: '14px' })
      .setOrigin(0.5, 0.9)
      .setDepth(this.localBody.y + 1);
    tool.setAngle(-50 * dir);
    this.tweens.add({
      targets: tool,
      angle: 40 * dir,
      duration: 140,
      yoyo: true,
      repeat: 1,
      onComplete: () => tool.destroy(),
    });
  }

  // ---------- bug catching (local-only, like fishing) ----------

  setupBugs() {
    this.bugs = [];
    for (let i = 0; i < BUG_COUNT; i++) {
      const sprite = this.add.text(0, 0, '🦋', { fontSize: '14px' }).setOrigin(0.5).setDepth(150000);
      const bug = { sprite, alive: true };
      this.bugs.push(bug);
      this.placeBug(bug);
    }
  }

  placeBug(bug) {
    bug.alive = true;
    bug.sprite.setVisible(true);
    bug.sprite.setPosition(
      Phaser.Math.Between(120, this.world.width - 120),
      Phaser.Math.Between(120, this.world.height - 120)
    );
    this.flutterBug(bug);
  }

  flutterBug(bug) {
    if (!bug.alive) return;
    const x = Phaser.Math.Clamp(bug.sprite.x + Phaser.Math.Between(-90, 90), 80, this.world.width - 80);
    const y = Phaser.Math.Clamp(bug.sprite.y + Phaser.Math.Between(-70, 70), 80, this.world.height - 80);
    bug.tween = this.tweens.add({
      targets: bug.sprite,
      x,
      y,
      duration: Phaser.Math.Between(1400, 2600),
      ease: 'Sine.easeInOut',
      onComplete: () => this.flutterBug(bug),
    });
  }

  findNearestBug() {
    let best = null;
    let bestDist = BUG_CATCH_RADIUS;
    this.bugs.forEach((bug) => {
      if (!bug.alive) return;
      const d = Math.hypot(this.localBody.x - bug.sprite.x, this.localBody.y - bug.sprite.y);
      if (d < bestDist) { bestDist = d; best = bug; }
    });
    return best;
  }

  catchBug(bug) {
    bug.alive = false;
    if (bug.tween) bug.tween.stop();
    bug.sprite.setVisible(false);
    this.gainResource('bugs', 1, bug.sprite.x, bug.sprite.y - 16);
    this.time.delayedCall(BUG_RESPAWN_MS, () => this.placeBug(bug));
  }

  // ---------- fossils + museum ----------
  // Dig spots work like mining a rock: a fixed location, a cooldown, no
  // network sync (local only, same as every other activity). What's
  // different is fossils aren't sold — they're carried in a small bag
  // (capped at 3) until donated at the Museum, where they join a
  // permanent per-device collection saved alongside name/species.

  setupFossils() {
    this.fossilCooldowns = {};
    const saved = loadSave();
    this.fossilsHeld = Array.isArray(saved.fossilsHeld) ? saved.fossilsHeld.slice(0, FOSSIL_BAG_CAP) : [];
    this.museumCollection = new Set(Array.isArray(saved.museumCollection) ? saved.museumCollection : []);
    this.updateFossilHUD();
  }

  saveFossils() {
    writeSave({ fossilsHeld: this.fossilsHeld, museumCollection: [...this.museumCollection] });
  }

  updateFossilHUD() {
    const bagEl = document.getElementById('fossil-count');
    if (bagEl) bagEl.textContent = this.fossilsHeld.length;
    const museumEl = document.getElementById('museum-count');
    if (museumEl) museumEl.textContent = this.museumCollection.size;
  }

  findNearestFossilSpot() {
    const now = Date.now();
    let best = null;
    let bestDist = FOSSIL_DIG_RADIUS;
    FOSSIL_SPOTS.forEach((spot, i) => {
      if (this.fossilCooldowns[i] && now - this.fossilCooldowns[i] < FOSSIL_RESPAWN_MS) return;
      const d = Math.hypot(this.localBody.x - spot.x, this.localBody.y - spot.y);
      if (d < bestDist) { bestDist = d; best = { ...spot, index: i }; }
    });
    return best;
  }

  digFossil(spot) {
    if (this.fossilsHeld.length >= FOSSIL_BAG_CAP) {
      this.showFloatingText(this.localBody.x, this.localBody.y - 30, 'fossil bag is full');
      return;
    }
    this.fossilCooldowns[spot.index] = Date.now();
    const mound = this.fossilMounds[spot.index];
    if (mound) {
      mound.setVisible(false);
      this.time.delayedCall(FOSSIL_RESPAWN_MS, () => mound.setVisible(true));
    }
    const typeIndex = Phaser.Math.Between(0, FOSSIL_TYPES.length - 1);
    this.fossilsHeld.push(typeIndex);
    this.saveFossils();
    this.updateFossilHUD();
    this.showFloatingText(spot.x, spot.y - 20, `found ${FOSSIL_TYPES[typeIndex]}`);
  }

  isNearMuseum() {
    const cx = MUSEUM_POS.x + MUSEUM_POS.w / 2;
    const cy = MUSEUM_POS.y + MUSEUM_POS.h / 2;
    return Math.hypot(this.localBody.x - cx, this.localBody.y - cy) < MUSEUM_RADIUS;
  }

  donateFossils() {
    if (!this.fossilsHeld.length) {
      this.showFloatingText(this.localBody.x, this.localBody.y - 30, "you don't have any fossils to donate");
      return;
    }
    let newSpecies = 0;
    this.fossilsHeld.forEach((typeIndex) => {
      if (!this.museumCollection.has(typeIndex)) { this.museumCollection.add(typeIndex); newSpecies++; }
    });
    const donated = this.fossilsHeld.length;
    this.fossilsHeld = [];
    this.saveFossils();
    this.updateFossilHUD();
    if (newSpecies > 0) {
      this.awardPoint(newSpecies, `donated ${donated} — +${newSpecies} ⭐ new species!`, this.localBody.x, this.localBody.y - 30);
    } else {
      this.showFloatingText(this.localBody.x, this.localBody.y - 30, `donated ${donated} (already had those species)`);
    }
    this.checkAchievements();
  }

  findNearestTree() {
    const now = Date.now();
    let best = null;
    let bestDist = TREE_SHAKE_RADIUS;
    TREES.forEach(([tx, ty], i) => {
      if (this.treeCooldowns[i] && now - this.treeCooldowns[i] < TREE_SHAKE_COOLDOWN_MS) return;
      const d = Math.hypot(this.localBody.x - tx, this.localBody.y - (ty - 10));
      if (d < bestDist) {
        bestDist = d;
        best = { x: tx, y: ty, index: i };
      }
    });
    return best;
  }

  findNearestRock() {
    const now = Date.now();
    let best = null;
    let bestDist = ROCK_MINE_RADIUS;
    const consider = (list, prefix) => {
      list.forEach(([x, y], i) => {
        const key = `${prefix}${i}`;
        if (this.rockCooldowns[key] && now - this.rockCooldowns[key] < TREE_SHAKE_COOLDOWN_MS) return;
        const d = Math.hypot(this.localBody.x - x, this.localBody.y - y);
        if (d < bestDist) {
          bestDist = d;
          best = { x, y, key };
        }
      });
    };
    consider(ROCKS, 'r');
    consider(PUNK_ROCKS, 'p');
    return best;
  }

  findNearestFishingSpot() {
    let best = null;
    let bestDist = FISH_INTERACT_RADIUS;
    FISHING_SPOTS.forEach((s) => {
      const d = Math.hypot(this.localBody.x - s.x, this.localBody.y - s.y);
      if (d < bestDist) {
        bestDist = d;
        best = s;
      }
    });
    return best;
  }

  gainResource(type, amount, x, y) {
    this.resources[type] = (this.resources[type] || 0) + amount;
    this.updateInventoryHUD();
    this.saveResources();
    const icon = { wood: '🪵', stone: '🪨', fish: '🐟', bugs: '🦋', fruit: '🍎' }[type];
    this.showFloatingText(x, y, `+${amount} ${icon}`);
    this.incrementStat(type, amount);
  }

  // ---------- achievements ----------

  setupAchievements() {
    const saved = loadSave();
    this.lifetimeStats = (saved.lifetimeStats && typeof saved.lifetimeStats === 'object') ? { ...saved.lifetimeStats } : {};
    this.achievementsUnlocked = new Set(Array.isArray(saved.achievementsUnlocked) ? saved.achievementsUnlocked : []);
    this.renderAchievementsPanel();
  }

  saveAchievements() {
    writeSave({ lifetimeStats: this.lifetimeStats, achievementsUnlocked: [...this.achievementsUnlocked] });
  }

  incrementStat(key, amount = 1) {
    this.lifetimeStats[key] = (this.lifetimeStats[key] || 0) + amount;
    this.saveAchievements();
    this.checkAchievements();
  }

  checkAchievements() {
    ACHIEVEMENTS.forEach((a) => {
      if (this.achievementsUnlocked.has(a.id)) return;
      if (!a.check(this.lifetimeStats, this)) return;
      this.achievementsUnlocked.add(a.id);
      this.saveAchievements();
      this.addChatLine({ system: true, text: `🏆 Achievement unlocked: ${a.icon} ${a.label} — +${a.reward} ⭐` });
      this.awardPoint(a.reward, `${a.icon} ${a.label}!`, this.localBody.x, this.localBody.y - 44);
      this.renderAchievementsPanel();
    });
  }

  renderAchievementsPanel() {
    const countEl = document.getElementById('achievement-count');
    if (countEl) countEl.textContent = this.achievementsUnlocked.size;
    const capEl = document.getElementById('achievement-cap');
    if (capEl) capEl.textContent = ACHIEVEMENTS.length;
    const listEl = document.getElementById('achievements-list');
    if (!listEl) return;
    listEl.innerHTML = '';
    ACHIEVEMENTS.forEach((a) => {
      const unlocked = this.achievementsUnlocked.has(a.id);
      const li = document.createElement('li');
      li.className = unlocked ? 'unlocked' : '';
      li.innerHTML = `<span class="ach-icon">${unlocked ? a.icon : '🔒'}</span>`
        + `<span class="ach-text"><b>${a.label}</b><br>${a.desc}</span>`
        + `<span class="ach-reward">+${a.reward} ⭐</span>`;
      listEl.appendChild(li);
    });
  }

  setupAchievementsUI() {
    document.getElementById('achievements-badge').addEventListener('click', () => {
      this.renderAchievementsPanel();
      document.getElementById('achievements-overlay').classList.remove('hidden');
      this.achievementsOpen = true;
    });
    document.getElementById('achievements-close-btn').addEventListener('click', () => {
      document.getElementById('achievements-overlay').classList.add('hidden');
      this.achievementsOpen = false;
    });
  }

  updateInventoryHUD() {
    const woodEl = document.getElementById('wood-count');
    const stoneEl = document.getElementById('stone-count');
    const fishEl = document.getElementById('fish-count');
    if (woodEl) woodEl.textContent = this.resources.wood || 0;
    if (stoneEl) stoneEl.textContent = this.resources.stone || 0;
    if (fishEl) fishEl.textContent = this.resources.fish || 0;
    const bugEl = document.getElementById('bug-count');
    if (bugEl) bugEl.textContent = this.resources.bugs || 0;
    const turnipEl = document.getElementById('turnip-count');
    if (turnipEl) turnipEl.textContent = this.resources.turnips || 0;
    const shellEl = document.getElementById('shell-count');
    if (shellEl) shellEl.textContent = this.resources.shells || 0;
    const fruitEl = document.getElementById('fruit-count');
    if (fruitEl) fruitEl.textContent = this.resources.fruit || 0;
  }

  // ---------- fishing ----------

  startFishing(spot) {
    this.fishing.state = 'casting';
    this.fishing.spot = spot;
    this.fishing.bobber = this.add.circle(spot.x, spot.y, 4, 0xffffff).setDepth(-1);
    this.fishing.rod = this.add.graphics().setDepth(100000);
    const waitMs = FISH_BITE_WAIT_MIN + Math.random() * (FISH_BITE_WAIT_MAX - FISH_BITE_WAIT_MIN);
    this.fishing.timer = this.time.delayedCall(waitMs, () => this.fishBite());
  }

  updateFishingRod() {
    if (!this.fishing.rod) return;
    const rod = this.fishing.rod;
    rod.clear();
    const tipX = this.localVisual.flipX ? this.localBody.x - 8 : this.localBody.x + 8;
    const tipY = this.localBody.y - 14;
    rod.lineStyle(2, 0x6b4226, 1);
    rod.lineBetween(tipX, tipY, this.fishing.spot.x, this.fishing.spot.y - 2);
  }

  fishBite() {
    if (this.fishing.state !== 'casting') return;
    this.fishing.state = 'biting';
    if (this.fishing.bobber) this.fishing.bobber.setFillStyle(0xff4444);
    this.showFloatingText(this.fishing.spot.x, this.fishing.spot.y - 24, '❗');
    this.fishing.timer = this.time.delayedCall(FISH_BITE_WINDOW, () => this.fishMiss());
  }

  fishMiss() {
    if (this.fishing.state !== 'biting') return;
    this.showFloatingText(this.fishing.spot.x, this.fishing.spot.y - 24, 'got away…');
    this.endFishing();
  }

  handleFishingInteract() {
    if (this.fishing.state === 'casting') {
      this.showFloatingText(this.fishing.spot.x, this.fishing.spot.y - 24, 'too early!');
      this.endFishing();
    } else if (this.fishing.state === 'biting') {
      this.gainResource('fish', 1, this.fishing.spot.x, this.fishing.spot.y - 24);
      this.endFishing();
    }
  }

  endFishing() {
    if (this.fishing.timer) this.fishing.timer.remove(false);
    if (this.fishing.bobber) this.fishing.bobber.destroy();
    if (this.fishing.rod) this.fishing.rod.destroy();
    this.fishing.state = 'idle';
    this.fishing.spot = null;
    this.fishing.bobber = null;
    this.fishing.rod = null;
    this.fishing.timer = null;
  }

  // ---------- building ----------
  // A lightweight, Minecraft-flavored sandbox layer: spend wood to place a
  // grid-snapped block in front of you; it's a real obstacle for everyone,
  // synced through Firebase, and you can remove your own blocks for a refund.

  setupBuilding() {
    this.blocks = new Map();
    this.buildMode = false;
    this.buildPreview = this.add.rectangle(0, 0, GRID_SIZE - 2, GRID_SIZE - 2, 0xffffff, 0)
      .setStrokeStyle(2, 0xffe066)
      .setDepth(400000)
      .setVisible(false);

    this.input.keyboard.on('keydown-B', () => { if (!this.chatFocused && !this.polyrollOpen && !this.achievementsOpen && !this.outfitShopOpen) this.toggleBuildMode(); });
    const btn = document.getElementById('build-toggle-btn');
    if (btn) btn.addEventListener('click', () => this.toggleBuildMode());
  }

  toggleBuildMode() {
    this.buildMode = !this.buildMode;
    const btn = document.getElementById('build-toggle-btn');
    if (btn) btn.classList.toggle('enabled', this.buildMode);
    this.buildPreview.setVisible(this.buildMode);
    document.getElementById('build-mode-banner').classList.toggle('hidden', !this.buildMode);
  }

  getBuildTargetCell() {
    const dir = this.localVisual.flipX ? -1 : 1;
    const tx = this.localBody.x + dir * BLOCK_PLACE_DISTANCE;
    const ty = this.localBody.y;
    const gx = Math.round(tx / GRID_SIZE) * GRID_SIZE;
    const gy = Math.round(ty / GRID_SIZE) * GRID_SIZE;
    return { gx, gy, key: `${gx}_${gy}` };
  }

  updateBuildPreview() {
    if (!this.buildMode) return;
    const { gx, gy } = this.getBuildTargetCell();
    this.buildPreview.setPosition(gx, gy);
  }

  handleBuildInteract() {
    const { gx, gy, key } = this.getBuildTargetCell();
    const existing = this.blocks.get(key);

    if (existing) {
      if (existing.ownerId === this.selfData.id) {
        this.net.removeBlock(key);
        this.resources.wood = (this.resources.wood || 0) + 1;
        this.updateInventoryHUD();
        this.saveResources();
      } else {
        this.showFloatingText(gx, gy - 20, "not yours");
      }
      return;
    }

    if ((this.resources.wood || 0) < 1) {
      this.showFloatingText(this.localBody.x, this.localBody.y - 30, 'need 🪵');
      return;
    }
    if (this.blocks.size >= BLOCK_CAP) {
      this.showFloatingText(this.localBody.x, this.localBody.y - 30, 'town is full!');
      return;
    }

    this.resources.wood -= 1;
    this.updateInventoryHUD();
    this.saveResources();
    this.net.placeBlock(gx, gy);
    this.incrementStat('blocksPlaced');
  }

  addBlockVisual(b) {
    if (this.blocks.has(b.key)) return;
    const sprite = this.add.rectangle(b.x, b.y, GRID_SIZE - 2, GRID_SIZE - 2, 0x8a5a3b, 1)
      .setStrokeStyle(2, 0x5a3a22)
      .setDepth(b.y);
    const obstacle = this.addObstacleRect({
      x: b.x - GRID_SIZE / 2 + 1,
      y: b.y - GRID_SIZE / 2 + 1,
      width: GRID_SIZE - 2,
      height: GRID_SIZE - 2,
    });
    this.blocks.set(b.key, { sprite, obstacle, ownerId: b.ownerId });
  }

  removeBlockVisual(key) {
    const b = this.blocks.get(key);
    if (!b) return;
    b.sprite.destroy();
    b.obstacle.destroy();
    this.blocks.delete(key);
  }

  // ---------- players ----------

  createShadow(x, y) {
    return this.add.ellipse(x, y + 9, 18, 8, 0x000000, 0.28).setDepth(-1);
  }

  createNameText(x, y, name) {
    return this.add.text(x, y - 22, censorBlockedTerms(name), {
      fontSize: '11px',
      fontFamily: 'monospace',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(100000);
  }

  createLocalPlayer(playerData) {
    this.localBody = this.physics.add.sprite(playerData.x, playerData.y, playerData.species, playerData.frame).setVisible(false);
    this.localBody.body.setCollideWorldBounds(true);
    this.localBody.body.setSize(16, 16).setOffset(4, 12);

    this.localVisual = this.add.sprite(playerData.x, playerData.y, playerData.species, playerData.frame);
    if (playerData.facing === -1) this.localVisual.setFlipX(true);

    this.localShadow = this.createShadow(playerData.x, playerData.y);
    this.localNameText = this.createNameText(playerData.x, playerData.y, playerData.name);
    this.localBobState = { phase: 0, lift: 0 };
  }

  addRemotePlayer(p) {
    const visual = this.add.sprite(p.x, p.y, p.species, p.frame).setFlipX(p.facing === -1);
    const shadow = this.createShadow(p.x, p.y);
    const nameText = this.createNameText(p.x, p.y, p.name);
    this.remotePlayers.set(p.id, {
      visual,
      shadow,
      nameText,
      bubble: null,
      x: p.x,
      y: p.y,
      targetX: p.x,
      targetY: p.y,
      facing: p.facing,
      species: p.species,
      frame: p.frame,
      bob: { phase: 0, lift: 0 },
    });
  }

  removeRemotePlayer(id) {
    const rp = this.remotePlayers.get(id);
    if (!rp) return;
    rp.visual.destroy();
    rp.shadow.destroy();
    rp.nameText.destroy();
    if (rp.bubble) rp.bubble.destroy();
    this.remotePlayers.delete(id);
  }

  showChatBubble(playerId, text) {
    let anchor;
    const isLocal = playerId === this.selfData.id;

    if (isLocal) {
      anchor = this.localVisual;
    } else {
      const rp = this.remotePlayers.get(playerId);
      if (!rp) return;
      anchor = rp.visual;
      if (rp.bubble) rp.bubble.destroy();
    }

    const bubble = this.add.text(anchor.x, anchor.y - 40, text, {
      fontSize: '11px',
      fontFamily: 'monospace',
      color: '#1c2430',
      backgroundColor: '#ffffff',
      padding: { x: 6, y: 4 },
      wordWrap: { width: 160 },
    }).setOrigin(0.5).setDepth(100001);

    if (!isLocal) {
      this.remotePlayers.get(playerId).bubble = bubble;
    }

    this.time.delayedCall(4000, () => bubble.destroy());
  }

  // ---------- world drawing ----------

  drawGround() {
    const g = this.add.graphics().setDepth(-2);
    g.fillStyle(0x6bbf59, 1).fillRect(0, 0, this.world.width, this.world.height);
    g.fillStyle(0x5aa84c, 1);
    for (let gx = 16; gx < this.world.width; gx += 48) {
      for (let gy = 16; gy < this.world.height; gy += 48) {
        if ((gx / 48 + gy / 48) % 3 === 0) g.fillRect(gx, gy, 4, 4);
      }
    }
  }

  drawPath() {
    const g = this.add.graphics().setDepth(-1);
    g.fillStyle(0xc9ab7a, 1);
    g.fillRect(0, 600 - 32, this.world.width, 64);
    g.fillRect(800 - 32, 0, 64, this.world.height);
    g.fillStyle(0xd9c294, 1);
    g.fillCircle(800, 600, 150);
  }

  drawPond() {
    const cx = 260;
    const cy = 600;
    const rx = 150;
    const ry = 90;
    const g = this.add.graphics().setDepth(-1);
    g.fillStyle(0x3a86c8, 1).fillEllipse(cx, cy, rx * 2, ry * 2);
    g.fillStyle(0x5ab0e8, 1).fillEllipse(cx - 20, cy - 15, rx * 1.3, ry * 0.9);
    g.fillStyle(0x8fd0f2, 1).fillEllipse(cx - 35, cy - 28, rx * 0.7, ry * 0.45);

    const gapHalf = 34;
    this.addObstacleRect({ x: cx - rx * 0.8, y: cy - ry * 0.8, width: rx * 1.6, height: ry * 0.8 - gapHalf });
    this.addObstacleRect({ x: cx - rx * 0.8, y: cy + gapHalf, width: rx * 1.6, height: ry * 0.8 - gapHalf });
  }

  drawPondCats() {
    POND_CATS.forEach(({ y, frame, range }) => {
      const startX = (range[0] + range[1]) / 2;
      const cat = this.add.sprite(startX, y, 'mooncats', frame).setDepth(-1);
      cat.prevX = startX;
      this.tweens.add({
        targets: cat,
        x: { from: range[0], to: range[1] },
        duration: 6000 + frame * 400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        onUpdate: () => {
          cat.setFlipX(cat.x < cat.prevX);
          cat.prevX = cat.x;
        },
      });
    });
  }

  drawEastPond() {
    const { cx, cy, rx, ry } = EAST_POND;
    const g = this.add.graphics().setDepth(-1);
    g.fillStyle(0x3a86c8, 1).fillEllipse(cx, cy, rx * 2, ry * 2);
    g.fillStyle(0x5ab0e8, 1).fillEllipse(cx - 15, cy - 12, rx * 1.3, ry * 0.9);
    g.fillStyle(0x8fd0f2, 1).fillEllipse(cx - 28, cy - 22, rx * 0.7, ry * 0.45);
    this.addObstacleRect({ x: cx - rx * 0.8, y: cy - ry * 0.8, width: rx * 1.6, height: ry * 1.6 });
  }

  drawBridge() {
    const cx = 260;
    const cy = 600;
    const g = this.add.graphics().setDepth(-1);
    g.fillStyle(0xa9784a, 1).fillRect(cx - 40, cy - 34, 80, 68);
    g.fillStyle(0x8a5f39, 1);
    for (let px = cx - 40; px < cx + 40; px += 10) g.fillRect(px, cy - 34, 2, 68);
    g.fillStyle(0x6b4226, 1);
    g.fillRect(cx - 40, cy - 36, 80, 4);
    g.fillRect(cx - 40, cy + 32, 80, 4);
  }

  drawHouse() {
    const { x, y, w, h } = HOUSE_POS;
    const g = this.add.graphics();
    g.fillStyle(0x8a5a3b, 1).fillRect(x, y, w, h);
    g.fillStyle(0xd9663b, 1).fillTriangle(x - 10, y, x + w + 10, y, x + w / 2, y - 45);
    g.fillStyle(0x5a3a22, 1).fillRect(x + w / 2 - 10, y + h - 28, 20, 28);
    g.fillStyle(0xcfe8f5, 1);
    g.fillRect(x + 16, y + 14, 20, 20);
    g.fillRect(x + w - 36, y + 14, 20, 20);
    g.setDepth(y + h);

    this.add.text(x + w / 2, y - 55, '🏠 Shop', { fontSize: '16px' }).setOrigin(0.5).setDepth(y + h + 1);
    this.addObstacleRect({ x, y: y + 20, width: w, height: h - 20 });
  }

  drawMuseum() {
    const { x, y, w, h } = MUSEUM_POS;
    const g = this.add.graphics();
    g.fillStyle(0xd8d0bc, 1).fillRect(x, y, w, h);
    g.fillStyle(0x8f8568, 1).fillTriangle(x - 10, y, x + w + 10, y, x + w / 2, y - 40);
    g.fillStyle(0x6b6250, 1);
    for (let i = 0; i < 4; i++) g.fillRect(x + 10 + i * 22, y + 16, 10, h - 20);
    g.setDepth(y + h);
    this.add.text(x + w / 2, y - 50, '🏛️ Museum', { fontSize: '14px' }).setOrigin(0.5).setDepth(y + h + 1);
    this.addObstacleRect({ x, y: y + 16, width: w, height: h - 16 });
  }

  drawAbleSisters() {
    const { x, y, w, h } = ABLE_SISTERS_POS;
    const g = this.add.graphics();
    g.fillStyle(0xd88fb0, 1).fillRect(x, y, w, h);
    g.fillStyle(0xe8b8d0, 1).fillTriangle(x - 8, y, x + w + 8, y, x + w / 2, y - 34);
    g.fillStyle(0xcfe8f5, 1).fillRect(x + w / 2 - 10, y + 14, 20, 18);
    g.setDepth(y + h);
    this.add.text(x + w / 2, y - 44, '👗 Able Sisters', { fontSize: '12px' }).setOrigin(0.5).setDepth(y + h + 1);
    this.addObstacleRect({ x, y: y + 14, width: w, height: h - 14 });
  }

  isNearAbleSisters() {
    const cx = ABLE_SISTERS_POS.x + ABLE_SISTERS_POS.w / 2;
    const cy = ABLE_SISTERS_POS.y + ABLE_SISTERS_POS.h / 2;
    return Math.hypot(this.localBody.x - cx, this.localBody.y - cy) < ABLE_SISTERS_RADIUS;
  }

  // ---------- Able Sisters outfit shop ----------
  // Same species/frame picker as the join screen, but live: applying
  // updates your own sprite immediately, writes through net.js so every
  // other player's child_changed listener re-textures your remote
  // sprite too, and persists locally like name/species already did.

  openOutfitShop() {
    this.outfitSpecies = this.selfData.species;
    this.outfitFrame = this.selfData.frame;
    this.renderOutfitTabs();
    this.renderOutfitGrid();
    document.getElementById('outfit-overlay').classList.remove('hidden');
    this.outfitShopOpen = true;
  }

  closeOutfitShop() {
    document.getElementById('outfit-overlay').classList.add('hidden');
    this.outfitShopOpen = false;
  }

  renderOutfitTabs() {
    const el = document.getElementById('outfit-species-tabs');
    el.innerHTML = '';
    SPECIES.forEach((s) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'species-tab' + (s.key === this.outfitSpecies ? ' active' : '');
      btn.textContent = s.label;
      btn.addEventListener('click', () => {
        this.outfitSpecies = s.key;
        this.outfitFrame = 0;
        this.renderOutfitTabs();
        this.renderOutfitGrid();
      });
      el.appendChild(btn);
    });
  }

  renderOutfitGrid() {
    const el = document.getElementById('outfit-avatar-grid');
    el.innerHTML = '';
    for (let frame = 0; frame < FRAME_COUNT; frame++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'avatar-choice' + (frame === this.outfitFrame ? ' selected' : '');
      btn.style.backgroundImage = `url(../i/${this.outfitSpecies}-strip.png)`;
      btn.style.backgroundPosition = `-${frame * 48}px 0`;
      btn.addEventListener('click', () => {
        this.outfitFrame = frame;
        this.renderOutfitGrid();
      });
      el.appendChild(btn);
    }
  }

  applyOutfit() {
    this.selfData.species = this.outfitSpecies;
    this.selfData.frame = this.outfitFrame;
    this.localVisual.setTexture(this.outfitSpecies, this.outfitFrame);
    this.localBody.setTexture(this.outfitSpecies, this.outfitFrame);
    writeSave({ species: this.outfitSpecies, frame: this.outfitFrame });
    this.net.updateAppearance(this.outfitSpecies, this.outfitFrame);
    this.closeOutfitShop();
    this.showFloatingText(this.localBody.x, this.localBody.y - 30, 'new look!');
  }

  setupOutfitShop() {
    document.getElementById('outfit-close-btn').addEventListener('click', () => this.closeOutfitShop());
    document.getElementById('outfit-apply-btn').addEventListener('click', () => this.applyOutfit());
  }

  drawTurnipStall() {
    const { x, y } = TURNIP_STALL_POS;
    const g = this.add.graphics().setDepth(y - 1);
    g.fillStyle(0x7a4a26, 1).fillRect(x - 26, y - 4, 52, 18);
    g.fillStyle(0xd9663b, 1).fillTriangle(x - 32, y - 4, x + 32, y - 4, x, y - 30);
    this.add.text(x, y - 46, '🥬 Turnips', { fontSize: '12px' }).setOrigin(0.5).setDepth(y + 1);
    this.turnipBuyLabel = this.add.text(x, y + 20, '', { fontSize: '11px', color: '#ffe066' }).setOrigin(0.5).setDepth(y + 1);
    this.turnipSellLabel = this.add.text(HOUSE_POS.x + HOUSE_POS.w / 2, HOUSE_POS.y - 38, '', { fontSize: '11px', color: '#6fbf73' }).setOrigin(0.5).setDepth(HOUSE_POS.y + 1);
  }

  updateTurnipPriceLabels(time) {
    if (time - (this.lastTurnipLabelAt || 0) < 1000) return;
    this.lastTurnipLabelAt = time;
    if (this.turnipBuyLabel) this.turnipBuyLabel.setText(`${this.turnipBuyPrice()} ⭐ / ${TURNIP_BUNDLE}`);
    if (this.turnipSellLabel) this.turnipSellLabel.setText(`sells ${this.turnipSellPrice()} ⭐ / ${TURNIP_BUNDLE}`);
  }

  drawFossilSpots() {
    this.fossilMounds = FOSSIL_SPOTS.map(({ x, y }) => {
      const g = this.add.graphics().setDepth(y - 1);
      g.fillStyle(0x7a5a38, 1).fillEllipse(x, y, 34, 18);
      g.fillStyle(0x8f7044, 1).fillEllipse(x, y - 3, 22, 10);
      return g;
    });
  }

  // ---------- beachcombing ----------
  // Fixed spots along the pond edges, same shape as the fishing spots:
  // walk up, interact, a short cooldown before it washes up again.
  // Local-only, like every other activity here.

  drawBeachItems() {
    this.beachCooldowns = {};
    this.beachSprites = BEACH_SPOTS.map(({ x, y }) => {
      const symbol = BEACH_ITEMS[Phaser.Math.Between(0, BEACH_ITEMS.length - 1)];
      return this.add.text(x, y, symbol, { fontSize: '16px' }).setOrigin(0.5).setDepth(y);
    });
  }

  findNearestBeachItem() {
    const now = Date.now();
    let best = null;
    let bestDist = BEACH_PICKUP_RADIUS;
    BEACH_SPOTS.forEach((spot, i) => {
      if (this.beachCooldowns[i] && now - this.beachCooldowns[i] < BEACH_RESPAWN_MS) return;
      const d = Math.hypot(this.localBody.x - spot.x, this.localBody.y - spot.y);
      if (d < bestDist) { bestDist = d; best = { ...spot, index: i }; }
    });
    return best;
  }

  collectBeachItem(spot) {
    this.beachCooldowns[spot.index] = Date.now();
    const sprite = this.beachSprites[spot.index];
    if (sprite) {
      sprite.setVisible(false);
      this.time.delayedCall(BEACH_RESPAWN_MS, () => {
        sprite.setText(BEACH_ITEMS[Phaser.Math.Between(0, BEACH_ITEMS.length - 1)]);
        sprite.setVisible(true);
      });
    }
    this.gainResource('shells', 1, spot.x, spot.y - 16);
  }

  drawStatue() {
    const { x, y } = STATUE_POS;
    const g = this.add.graphics();
    g.fillStyle(0x9a9a9a, 1).fillRect(x - 24, y, 48, 14);
    g.fillStyle(0x7d7d7d, 1).fillRect(x - 18, y - 10, 36, 10);
    g.setDepth(y - 1);

    const ape = this.add.sprite(x, y - 28, 'boredapes', 0).setScale(2.3).setDepth(y);
    this.add.text(x, y - 68, '🐵 Mayor', {
      fontSize: '12px',
      fontFamily: 'monospace',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(y + 1);

    this.addObstacleRect({ x: x - 22, y: y - 8, width: 44, height: 20 });
  }

  drawCampfire() {
    const { x, y } = CAMPFIRE_POS;
    const logs = this.add.graphics().setDepth(-1);
    logs.fillStyle(0x6b4226, 1);
    logs.fillRect(x - 16, y - 3, 32, 6);
    logs.fillRect(x - 4, y - 14, 8, 28);

    const flame = this.add.circle(x, y - 8, 9, 0xffb238).setDepth(-1);
    const flameInner = this.add.circle(x, y - 8, 5, 0xffe066).setDepth(-1);
    this.tweens.add({ targets: [flame, flameInner], scale: { from: 0.85, to: 1.15 }, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this.kkSign = this.add.text(x, y - 42, '🎸 K.K. Slider is playing!', { fontSize: '12px' })
      .setOrigin(0.5)
      .setDepth(y + 1)
      .setVisible(false);
    this.kkNotes = ['🎵', '🎶', '🎵'].map((sym, i) => this.add.text(x - 16 + i * 16, y - 10, sym, { fontSize: '13px' }).setOrigin(0.5).setDepth(y + 1).setVisible(false));
  }

  // ---------- K.K. Slider campfire concert ----------
  // A real AC staple: a live show at a fixed time of day, local to each
  // player's own clock (same source as day/night) rather than anything
  // synced over the network. One ⭐ bonus per show, guarded by a
  // per-window flag so you can't just stand there and farm it.

  isConcertTime() {
    const hour = new Date().getHours();
    return hour >= KK_CONCERT_START_HOUR && hour < KK_CONCERT_END_HOUR;
  }

  concertWindowKey() {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`;
  }

  isNearCampfire() {
    return Math.hypot(this.localBody.x - CAMPFIRE_POS.x, this.localBody.y - CAMPFIRE_POS.y) < CAMPFIRE_RADIUS;
  }

  updateConcert(time) {
    if (time - (this.lastConcertCheckAt || 0) < 1000) return;
    this.lastConcertCheckAt = time;
    const playing = this.isConcertTime();
    if (this.kkSign) this.kkSign.setVisible(playing);
    this.kkNotes.forEach((n, i) => {
      n.setVisible(playing);
      if (playing) n.y = CAMPFIRE_POS.y - 10 + Math.sin(time / 300 + i) * 4;
    });
  }

  enjoyConcert() {
    const key = this.concertWindowKey();
    if (this.kkEnjoyedWindow === key) {
      this.showFloatingText(this.localBody.x, this.localBody.y - 30, 'already enjoyed tonight\'s show');
      return;
    }
    this.kkEnjoyedWindow = key;
    writeSave({ kkEnjoyedWindow: key });
    this.awardPoint(2, '🎶 +2 ⭐ enjoyed the show!', this.localBody.x, this.localBody.y - 30);
    this.triggerEmote(1);
  }

  drawDigHole() {
    const { x, y } = DIG_HOLE_POS;
    const g = this.add.graphics().setDepth(-1);
    g.fillStyle(0x1a1410, 1).fillEllipse(x, y, 42, 26);
    g.fillStyle(0x100b08, 1).fillEllipse(x, y, 28, 16);
    this.add.text(x, y - 26, '⛏️ Hole', { fontSize: '12px' }).setOrigin(0.5).setDepth(y + 1);
  }

  drawDoor(x, y, label, color) {
    const g = this.add.graphics().setDepth(y - 1);
    g.fillStyle(0x3a2a1a, 1).fillRect(x - 16, y - 46, 32, 46);
    g.fillStyle(color, 0.85).fillRect(x - 12, y - 42, 24, 38);
    g.fillStyle(0xffffff, 0.9).fillCircle(x + 7, y - 22, 2);
    this.add.text(x, y - 56, label, { fontSize: '12px' }).setOrigin(0.5).setDepth(y + 1);
    this.tweens.add({
      targets: g,
      alpha: { from: 0.8, to: 1 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  drawDoors() {
    PORTALS.forEach((p) => this.drawDoor(p.x, p.y, p.label, p.color));
  }

  drawForestRing() {
    this.treeGraphics = [];
    this.treeFruit = {};
    TREES.forEach(([x, y]) => this.drawTree(x, y));
  }

  drawTree(x, y) {
    const g = this.add.graphics();
    g.fillStyle(0x5a3a22, 1).fillRect(-4, -4, 8, 16);
    g.fillStyle(0x3f8f4f, 1).fillCircle(0, -20, 17);
    g.fillStyle(0x4fa85f, 1).fillCircle(-11, -12, 13);
    g.fillStyle(0x4fa85f, 1).fillCircle(11, -12, 13);
    g.fillStyle(0x5cb86a, 1).fillCircle(0, -28, 12);
    g.setPosition(x, y);
    g.setDepth(y);
    this.addObstacleRect({ x: x - 5, y: y - 3, width: 10, height: 12 });
    this.treeGraphics.push(g);

    const index = this.treeGraphics.length - 1;
    if (index % FRUIT_TREE_EVERY === 0) {
      const fruit = this.add.graphics();
      fruit.fillStyle(0xe0453a, 1);
      fruit.fillCircle(-9, -14, 3.5).fillCircle(8, -19, 3.5).fillCircle(1, -29, 3.5);
      fruit.setPosition(x, y).setDepth(y + 0.5);
      this.treeFruit[index] = fruit;
    }
  }

  drawTulipBeds() {
    TULIP_BEDS.forEach((bed) => {
      bed.frames.forEach((frame, i) => {
        const px = bed.x + i * 20 - ((bed.frames.length - 1) * 10);
        this.add.sprite(px, bed.y, 'tulips', frame).setDepth(-1);
      });
    });
  }

  drawRocks() {
    ROCKS.forEach(([x, y, frame]) => {
      this.add.sprite(x, y, 'rocks', frame).setDepth(-1);
    });
  }

  drawPunkRocks() {
    PUNK_ROCKS.forEach(([x, y, frame]) => {
      this.add.sprite(x, y, 'punkrocks', frame).setDepth(-1);
    });
  }

  addObstacleRect({ x, y, width, height }) {
    const rect = this.add.rectangle(x + width / 2, y + height / 2, width, height, 0x000000, 0).setVisible(false);
    this.physics.add.existing(rect, true);
    this.obstacles.add(rect);
    return rect;
  }

  // ---------- networking ----------

  registerNetHandlers() {
    this.net.on('playerJoined', (p) => {
      if (this.remotePlayers.has(p.id)) return;
      this.allPlayers.set(p.id, p);
      this.addRemotePlayer(p);
      this.renderPlayerList();
    });

    this.net.on('playerLeft', (id) => {
      this.allPlayers.delete(id);
      this.removeRemotePlayer(id);
      this.renderPlayerList();
    });

    this.net.on('playerUpdated', (d) => {
      const rp = this.remotePlayers.get(d.id);
      if (!rp) return;
      rp.targetX = d.x;
      rp.targetY = d.y;
      rp.facing = d.facing;
      if (d.species && (d.species !== rp.species || d.frame !== rp.frame)) {
        rp.species = d.species;
        rp.frame = d.frame;
        rp.visual.setTexture(d.species, d.frame);
      }

      const known = this.allPlayers.get(d.id);
      if (known && known.score !== d.score) {
        known.score = d.score || 0;
        this.renderPlayerList();
      }

      if (d.emote && d.emoteAt && this.lastEmoteAt.get(d.id) !== d.emoteAt) {
        this.lastEmoteAt.set(d.id, d.emoteAt);
        this.showEmoteBubble(d.id, d.emote);
      }
    });

    this.net.on('chat', (msg) => {
      this.addChatLine({ name: msg.name, text: msg.text });
      if (!msg.isOld) this.showChatBubble(msg.id, msg.text);
    });

    this.net.on('selfRemoved', () => {
      this.addChatLine({ system: true, text: 'Lost your spot in town (connection dropped). You can still look around, but refresh to fully rejoin.' });
    });

    this.net.on('blockAdded', (b) => this.addBlockVisual(b));
    this.net.on('blockRemoved', (b) => this.removeBlockVisual(b.key));
  }

  // ---------- DOM: chat + player list ----------

  registerChatUI() {
    const chatInput = document.getElementById('chat-input');

    chatInput.addEventListener('focus', () => { this.chatFocused = true; });
    chatInput.addEventListener('blur', () => { this.chatFocused = false; });

    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.sendChatMessage();
      } else if (e.key === 'Escape') {
        chatInput.value = '';
        chatInput.blur();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && document.activeElement !== chatInput) {
        chatInput.focus();
        e.preventDefault();
      }
    });

    // Clears this device's own view of the log only — it's a local
    // declutter button, not a moderation tool, so it doesn't touch the
    // shared Firebase chat history or anyone else's screen.
    document.getElementById('chat-clear-btn').addEventListener('click', () => {
      document.getElementById('chat-log').innerHTML = '';
      document.getElementById('chat-clear-btn').classList.add('hidden');
    });
  }

  sendChatMessage() {
    const chatInput = document.getElementById('chat-input');
    const text = chatInput.value.trim();
    if (text && containsBlockedTerm(text)) {
      this.addChatLine({ system: true, text: "That message wasn't sent — please keep it clean." });
      chatInput.value = '';
      chatInput.blur();
      return;
    }
    if (text) {
      this.net.sendChat(text);
      this.incrementStat('chatSent');
    }
    chatInput.value = '';
    chatInput.blur();
  }

  addChatLine({ name, text, system }) {
    const chatLog = document.getElementById('chat-log');
    const line = document.createElement('div');
    line.className = system ? 'chat-line system' : 'chat-line';

    if (!system) {
      const who = document.createElement('span');
      who.className = 'who';
      // Defense in depth: a malicious client can write straight to Firebase
      // and skip the checks above entirely, so anything rendered from
      // someone else's data gets masked here too, not just on our own send.
      who.textContent = `${censorBlockedTerms(name)}:`;
      line.appendChild(who);
      line.appendChild(document.createTextNode(` ${censorBlockedTerms(text)}`));
    } else {
      line.textContent = text;
    }

    chatLog.appendChild(line);
    chatLog.scrollTop = chatLog.scrollHeight;
    document.getElementById('chat-clear-btn').classList.remove('hidden');

    while (chatLog.children.length > 50) chatLog.removeChild(chatLog.firstChild);
  }

  renderPlayerList() {
    const listEl = document.getElementById('player-list');
    listEl.innerHTML = '';
    const sorted = Array.from(this.allPlayers.values()).sort((a, b) => (b.score || 0) - (a.score || 0));
    sorted.forEach((p) => {
      const li = document.createElement('li');
      const safeName = censorBlockedTerms(p.name);
      const label = p.id === this.selfData.id ? `${safeName} (you)` : safeName;
      const text = document.createElement('span');
      text.textContent = `${label} — ⭐${p.score || 0}`;
      li.appendChild(text);

      if (p.id !== this.selfData.id) {
        const star = document.createElement('button');
        star.type = 'button';
        star.className = 'bestie-star' + (this.bestieId === p.id ? ' active' : '');
        star.title = `Set ${p.name} as your walkie-talkie bestie`;
        star.textContent = this.bestieId === p.id ? '💛' : '🤍';
        star.addEventListener('click', () => this.setBestie(p.id, p.name));
        li.appendChild(star);
      }
      listEl.appendChild(li);
    });
  }

  // ---------- walkie-talkie (push-to-talk voice clips, bestie-only) ----------
  // Fully peer-addressed, like chat but binary: a short recorded clip is
  // base64-encoded and pushed to /walkie/{bestieId} in Firebase. If the
  // recipient's tab is visible right now it plays instantly; otherwise it's
  // queued as an unread voice memo and plays (or waits to be tapped) the
  // moment they come back — a real background-tab web app can't reliably
  // keep running or play audio while backgrounded/closed, so "while this
  // tab is open and in front of you" is the honest scope here.

  setupWalkie() {
    this.bestieId = savedProfile.bestieId || null;
    this.bestieName = savedProfile.bestieName || null;
    this.voiceMemos = [];
    this.recording = false;
    this.updateBestieLabel();

    if (this.net.db && this.net.id) {
      this.walkieRef = this.net.db.ref(`walkie/${this.net.id}`);
      this.walkieRef.on('child_added', (snap) => {
        const v = snap.val();
        if (!v || !v.data) return;
        const memo = { key: snap.key, from: v.from, fromName: v.fromName || 'someone', data: v.data, mime: v.mime || 'audio/webm' };
        this.voiceMemos.push(memo);
        this.updateMemoBadge();
        if (document.visibilityState === 'visible') this.playMemo(memo);
      });
    }

    const talkBtn = document.getElementById('walkie-talk-btn');
    const press = (e) => { e.preventDefault(); this.startRecording(); };
    const release = () => this.stopRecording();
    talkBtn.addEventListener('pointerdown', press);
    talkBtn.addEventListener('pointerup', release);
    talkBtn.addEventListener('pointerleave', release);

    window.addEventListener('keydown', (e) => {
      if (this.chatFocused || this.inUnderground) return;
      if (e.key.toLowerCase() === 't' && !this.recording) this.startRecording();
    });
    window.addEventListener('keyup', (e) => {
      if (e.key.toLowerCase() === 't') this.stopRecording();
    });

    document.getElementById('memo-inbox-btn').addEventListener('click', () => {
      if (this.voiceMemos.length) this.playMemo(this.voiceMemos[0]);
    });
  }

  setBestie(id, name) {
    this.bestieId = id;
    this.bestieName = name;
    writeSave({ bestieId: id, bestieName: name });
    this.updateBestieLabel();
    this.renderPlayerList();
  }

  updateBestieLabel() {
    const label = document.getElementById('bestie-label');
    const talkBtn = document.getElementById('walkie-talk-btn');
    if (label) label.textContent = this.bestieId ? `to ${this.bestieName}` : 'pick a bestie →';
    if (talkBtn) talkBtn.disabled = !this.bestieId;
  }

  async startRecording() {
    if (this.recording || !this.bestieId) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.recording = true;
      document.getElementById('walkie-talk-btn').classList.add('recording');
      this.walkieStream = stream;
      this.walkieChunks = [];
      // iOS Safari records AAC/mp4, not webm — ask for whatever this
      // browser actually supports instead of assuming one.
      const candidates = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'];
      const supported = candidates.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t));
      this.walkieRecorder = new MediaRecorder(stream, supported ? { mimeType: supported } : undefined);
      this.walkieRecorder.ondataavailable = (e) => { if (e.data.size) this.walkieChunks.push(e.data); };
      this.walkieRecordedAt = Date.now();
      this.walkieRecorder.start();
      this.walkieTimeout = setTimeout(() => this.stopRecording(), 15000); // cap a clip at 15s
    } catch (e) {
      this.showFloatingText(this.localBody.x, this.localBody.y - 30, 'mic permission needed');
    }
  }

  stopRecording() {
    if (!this.recording) return;
    this.recording = false;
    clearTimeout(this.walkieTimeout);
    document.getElementById('walkie-talk-btn').classList.remove('recording');
    const tooShort = Date.now() - this.walkieRecordedAt < 300;
    const recorder = this.walkieRecorder;
    const stream = this.walkieStream;
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (tooShort || !this.walkieChunks.length) return;
      const mime = recorder.mimeType || 'audio/webm';
      const blob = new Blob(this.walkieChunks, { type: mime });
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = String(reader.result).split(',')[1];
        if (base64) this.net.sendWalkie(this.bestieId, base64, mime);
      };
      reader.readAsDataURL(blob);
    };
    recorder.stop();
  }

  playMemo(memo) {
    try {
      const audio = new Audio(`data:${memo.mime};base64,${memo.data}`);
      audio.play().catch(() => {});
    } catch (e) { /* unsupported format on this device — still clear it below */ }
    this.voiceMemos = this.voiceMemos.filter((m) => m.key !== memo.key);
    this.updateMemoBadge();
    if (this.walkieRef) this.walkieRef.child(memo.key).remove().catch(() => {});
  }

  updateMemoBadge() {
    const btn = document.getElementById('memo-inbox-btn');
    const count = document.getElementById('memo-count');
    if (count) count.textContent = this.voiceMemos.length;
    if (btn) btn.classList.toggle('hidden', this.voiceMemos.length === 0);
  }
}

// ---------------- join overlay ----------------

const nameInput = document.getElementById('name-input');
const speciesTabsEl = document.getElementById('species-tabs');
const avatarGridEl = document.getElementById('avatar-grid');
const joinBtn = document.getElementById('join-btn');
const joinError = document.getElementById('join-error');
const joinOverlay = document.getElementById('join-overlay');
const hud = document.getElementById('hud');

let savedProfile = loadSave();
let selectedSpecies = SPECIES.some((s) => s.key === savedProfile.species) ? savedProfile.species : SPECIES[0].key;
let selectedFrame = Number.isInteger(savedProfile.frame) && savedProfile.frame >= 0 && savedProfile.frame < FRAME_COUNT
  ? savedProfile.frame
  : 0;
if (savedProfile.name) nameInput.value = savedProfile.name;

function renderSpeciesTabs() {
  speciesTabsEl.innerHTML = '';
  SPECIES.forEach((s) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'species-tab' + (s.key === selectedSpecies ? ' active' : '');
    btn.textContent = s.label;
    btn.addEventListener('click', () => {
      selectedSpecies = s.key;
      selectedFrame = 0;
      renderSpeciesTabs();
      renderAvatarGrid();
    });
    speciesTabsEl.appendChild(btn);
  });
}

function renderAvatarGrid() {
  avatarGridEl.innerHTML = '';
  for (let frame = 0; frame < FRAME_COUNT; frame++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'avatar-choice' + (frame === selectedFrame ? ' selected' : '');
    btn.style.backgroundImage = `url(../i/${selectedSpecies}-strip.png)`;
    btn.style.backgroundPosition = `-${frame * 48}px 0`;
    btn.addEventListener('click', () => {
      selectedFrame = frame;
      renderAvatarGrid();
    });
    avatarGridEl.appendChild(btn);
  }
}

function updateJoinButtonState() {
  joinBtn.disabled = nameInput.value.trim().length === 0;
}

nameInput.addEventListener('input', updateJoinButtonState);
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !joinBtn.disabled) attemptJoin();
});
joinBtn.addEventListener('click', attemptJoin);

function attemptJoin() {
  const name = nameInput.value.trim();
  if (!name) return;
  if (containsBlockedTerm(name)) {
    joinError.textContent = 'Please pick a different name.';
    return;
  }
  joinBtn.disabled = true;
  joinError.textContent = '';
  writeSave({ name, species: selectedSpecies, frame: selectedFrame });

  const net = new TownNet();
  let joined = false;

  net.on('configMissing', () => {
    joinError.textContent = 'Not connected to a Firebase project yet — see game/firebase-config.js.';
    joinBtn.disabled = false;
  });
  net.on('townFull', () => {
    joinError.textContent = 'Town is full right now (10 max) — try again shortly.';
    joinBtn.disabled = false;
  });
  net.on('error', (text) => {
    joinError.textContent = text;
    joinBtn.disabled = false;
  });
  net.on('init', (data) => {
    if (joined) return;
    joined = true;
    joinOverlay.classList.add('hidden');
    hud.classList.remove('hidden');
    startTown(net, data);
  });

  net.join({ name, species: selectedSpecies, frame: selectedFrame });
}

function startTown(net, data) {
  const config = {
    type: Phaser.AUTO,
    parent: 'game-container',
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: '#3a5a40',
    pixelArt: true,
    physics: { default: 'arcade', arcade: { debug: false } },
  };
  const game = new Phaser.Game(config);
  game.scene.add('Town', TownScene, true, { net, self: data.self, players: data.players, world: data.world });

  window.addEventListener('resize', () => {
    game.scale.resize(window.innerWidth, window.innerHeight);
  });
}

renderSpeciesTabs();
renderAvatarGrid();
updateJoinButtonState();
