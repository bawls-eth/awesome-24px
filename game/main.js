const FRAME_SIZE = 24;
const FRAME_COUNT = 9;
const HOP_HEIGHT = 5; // px of vertical lift at the peak of a walk hop
const HOP_SPEED = 9; // radians/sec the hop phase advances while moving
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
const DIG_HOLE_POS = { x: 1200, y: 460 };
const DIG_HOLE_RADIUS = 36;
const EAST_POND = { cx: 2000, cy: 280, rx: 130, ry: 80 };

const FISHING_SPOTS = [
  { x: 115, y: 600 },
  { x: 260, y: 700 },
  { x: 2000, y: 170 },
  { x: 1865, y: 280 },
];
const FISH_INTERACT_RADIUS = 36;
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
    this.setupActivities();
    this.setupBuilding();
    this.setupWalkie();
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
    this.updateBuildPreview();
    this.updateFishingRod();
    this.updateDigHoleHint();
  }

  // ---------- movement ----------

  updateLocalMovement(time, delta) {
    const speed = 140;
    let vx = 0;
    let vy = 0;

    if (!this.chatFocused) {
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
    };
    this.treeCooldowns = {};
    this.rockCooldowns = {};
    this.fishing = { state: 'idle', spot: null, bobber: null, timer: null };
    this.updateInventoryHUD();

    this.input.keyboard.on('keydown-E', () => { if (!this.chatFocused) this.interact(); });
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
    if (this.isNearShop()) {
      this.sellAtShop();
      return;
    }
    if (this.isNearDigHole()) {
      this.enterUnderground();
      return;
    }

    const tree = this.findNearestTree();
    if (tree) {
      this.treeCooldowns[tree.index] = Date.now();
      this.shakeTreeVisual(tree.index);
      this.gainResource('wood', 1, tree.x, tree.y - 40);
      return;
    }

    const rock = this.findNearestRock();
    if (rock) {
      this.rockCooldowns[rock.key] = Date.now();
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

  sellAtShop() {
    const total = (this.resources.wood || 0) + (this.resources.stone || 0) + (this.resources.fish || 0);
    if (total === 0) {
      this.showFloatingText(this.localBody.x, this.localBody.y - 30, 'bag is empty');
      return;
    }
    this.resources = { wood: 0, stone: 0, fish: 0 };
    this.updateInventoryHUD();
    this.saveResources();
    this.awardPoint(total, `sold! +${total} ⭐`, this.localBody.x, this.localBody.y - 30);
  }

  // ---------- underground (3D voxel cave, local-only) ----------

  isNearDigHole() {
    return Math.hypot(this.localBody.x - DIG_HOLE_POS.x, this.localBody.y - DIG_HOLE_POS.y) < DIG_HOLE_RADIUS;
  }

  updateDigHoleHint() {
    const hint = document.getElementById('dig-hole-hint');
    if (!hint) return;
    hint.classList.toggle('hidden', this.inUnderground || this.buildMode || !this.isNearDigHole());
  }

  enterUnderground() {
    if (this.inUnderground) return;
    this.inUnderground = true;
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

  setupUndergroundControls() {
    const ug = this.underground;
    this.input.keyboard && window.addEventListener('keydown', (e) => {
      if (!this.inUnderground) return;
      const k = e.key.toLowerCase();
      if (k === 'e') {
        if (ug.nearExit) this.exitUnderground();
        else ug.mine();
      } else if (k === 'f') {
        ug.place();
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

    document.getElementById('ug-mine-btn').addEventListener('click', () => ug.mine());
    document.getElementById('ug-place-btn').addEventListener('click', () => ug.place());
    document.getElementById('ug-exit-btn').addEventListener('click', () => { if (ug.nearExit) this.exitUnderground(); });

    this._ugExitHintInterval = setInterval(() => {
      if (!this.inUnderground) return;
      document.getElementById('underground-exit-hint').classList.toggle('hidden', !ug.nearExit);
    }, 150);
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
    const icon = type === 'wood' ? '🪵' : type === 'stone' ? '🪨' : '🐟';
    this.showFloatingText(x, y, `+${amount} ${icon}`);
  }

  updateInventoryHUD() {
    const woodEl = document.getElementById('wood-count');
    const stoneEl = document.getElementById('stone-count');
    const fishEl = document.getElementById('fish-count');
    if (woodEl) woodEl.textContent = this.resources.wood || 0;
    if (stoneEl) stoneEl.textContent = this.resources.stone || 0;
    if (fishEl) fishEl.textContent = this.resources.fish || 0;
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

    this.input.keyboard.on('keydown-B', () => { if (!this.chatFocused) this.toggleBuildMode(); });
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
    return this.add.text(x, y - 22, name, {
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
    const x = 800;
    const y = 600;
    const logs = this.add.graphics().setDepth(-1);
    logs.fillStyle(0x6b4226, 1);
    logs.fillRect(x - 16, y - 3, 32, 6);
    logs.fillRect(x - 4, y - 14, 8, 28);

    const flame = this.add.circle(x, y - 8, 9, 0xffb238).setDepth(-1);
    const flameInner = this.add.circle(x, y - 8, 5, 0xffe066).setDepth(-1);
    this.tweens.add({ targets: [flame, flameInner], scale: { from: 0.85, to: 1.15 }, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  drawDigHole() {
    const { x, y } = DIG_HOLE_POS;
    const g = this.add.graphics().setDepth(-1);
    g.fillStyle(0x1a1410, 1).fillEllipse(x, y, 42, 26);
    g.fillStyle(0x100b08, 1).fillEllipse(x, y, 28, 16);
    this.add.text(x, y - 26, '⛏️ Hole', { fontSize: '12px' }).setOrigin(0.5).setDepth(y + 1);
  }

  drawForestRing() {
    this.treeGraphics = [];
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
  }

  sendChatMessage() {
    const chatInput = document.getElementById('chat-input');
    const text = chatInput.value.trim();
    if (text) this.net.sendChat(text);
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
      who.textContent = `${name}:`;
      line.appendChild(who);
      line.appendChild(document.createTextNode(` ${text}`));
    } else {
      line.textContent = text;
    }

    chatLog.appendChild(line);
    chatLog.scrollTop = chatLog.scrollHeight;

    while (chatLog.children.length > 50) chatLog.removeChild(chatLog.firstChild);
  }

  renderPlayerList() {
    const listEl = document.getElementById('player-list');
    listEl.innerHTML = '';
    const sorted = Array.from(this.allPlayers.values()).sort((a, b) => (b.score || 0) - (a.score || 0));
    sorted.forEach((p) => {
      const li = document.createElement('li');
      const label = p.id === this.selfData.id ? `${p.name} (you)` : p.name;
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
