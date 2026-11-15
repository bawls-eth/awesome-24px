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
];

const EMOTES = ['😀', '❤️', '😂', '👋', '🎉'];
const SPARKLE_SPOTS = [
  [500, 300], [1100, 300], [500, 950], [1150, 940], [300, 780],
  [1280, 650], [700, 850], [900, 400], [650, 350], [1050, 950],
];
const SPARKLE_ROTATE_MS = 8000;
const SPARKLE_CATCH_RADIUS = 26;

const IS_TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
if (IS_TOUCH) document.body.classList.add('touch-device');

const TILT_DEADZONE_DEG = 4;
const TILT_RANGE_DEG = 22;
const SHAKE_THRESHOLD = 15; // m/s^2 jump in accelerationIncludingGravity magnitude
const SHAKE_COOLDOWN_MS = 800;
const TREE_SHAKE_RADIUS = 46;
const TREE_SHAKE_COOLDOWN_MS = 20000;

// Fixed town layout. WORLD size (1600x1200) is defined in net.js — everyone's
// client draws the same map so landmarks mean the same thing to everyone.
const TREES = [
  [60, 50], [220, 40], [380, 55], [560, 45], [680, 60],
  [920, 60], [1040, 45], [1200, 55], [1360, 40], [1520, 50],
  [60, 1150], [220, 1160], [380, 1145], [560, 1155], [680, 1140],
  [920, 1140], [1040, 1155], [1200, 1145], [1360, 1160], [1520, 1150],
  [40, 180], [50, 320], [40, 880], [55, 1020],
  [1550, 180], [1560, 320], [1540, 460], [1545, 740], [1555, 880], [1540, 1020],
];
const TULIP_BEDS = [
  { x: 700, y: 520, frames: [0, 1, 2] },
  { x: 900, y: 520, frames: [3, 4, 5] },
  { x: 700, y: 680, frames: [6, 7, 8] },
  { x: 900, y: 680, frames: [0, 3, 6] },
  { x: 1150, y: 900, frames: [1, 4, 7] },
];
const ROCKS = [
  [500, 470, 0], [1080, 470, 3], [500, 730, 5], [1080, 730, 2],
  [760, 460, 1], [840, 460, 4], [300, 900, 6], [1300, 300, 7],
  [1300, 900, 8], [150, 1050, 0],
];

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
  }

  create() {
    this.physics.world.setBounds(0, 0, this.world.width, this.world.height);
    this.cameras.main.setBounds(0, 0, this.world.width, this.world.height);
    this.cameras.main.setZoom(2);

    this.obstacles = [];
    this.remotePlayers = new Map();

    this.drawGround();
    this.drawPath();
    this.drawPond();
    this.drawBridge();
    this.drawHouse();
    this.drawCampfire();
    this.drawForestRing();
    this.drawTulipBeds();
    this.drawRocks();

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
    if (IS_TOUCH) {
      this.setupTouchControls();
      this.setupTiltShake();
    }

    this.registerNetHandlers();
    this.registerChatUI();
    this.renderPlayerList();
    this.addChatLine({ system: true, text: 'Welcome to Pixeltown! WASD/arrows to move, Enter to chat, 1-5 to emote, walk into a sparkle to score.' });

    // Handlers are wired up — safe to start receiving live updates now.
    this.net.startListening();
  }

  update(time, delta) {
    this.updateLocalMovement(time, delta);
    this.updateRemoteInterpolation(delta);
    this.updateSparkle(time);
    this.updateDayNight(time);
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
      this.awardPoint('+1 ⭐', this.localBody.x, this.localBody.y - 30);
    }
  }

  awardPoint(label, x, y) {
    this.localScore += 1;
    this.net.addScore(1);
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
    this.treeCooldowns = {};

    const hasOrientation = typeof window.DeviceOrientationEvent !== 'undefined';
    const btn = document.getElementById('tilt-toggle-btn');
    if (!hasOrientation) {
      btn.style.display = 'none';
      return;
    }

    btn.addEventListener('click', () => this.enableTiltShake(btn));
  }

  async enableTiltShake(btn) {
    if (this.tiltEnabled) return;

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

    this.tiltEnabled = true;
    this.tiltBaseline = null;
    btn.classList.add('enabled');
    btn.textContent = '🎮 Tilt ✓';

    window.addEventListener('deviceorientation', (e) => this.onDeviceOrientation(e));
    window.addEventListener('devicemotion', (e) => this.onDeviceMotion(e));
    this.addChatLine({ system: true, text: 'Tilt to steer, shake near a tree for a point!' });
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

  onShake() {
    let nearestIndex = -1;
    let nearestDist = Infinity;
    TREES.forEach(([tx, ty], i) => {
      const d = Math.hypot(this.localBody.x - tx, this.localBody.y - (ty - 10));
      if (d < TREE_SHAKE_RADIUS && d < nearestDist) {
        nearestDist = d;
        nearestIndex = i;
      }
    });

    const now = Date.now();
    const onCooldown = nearestIndex >= 0 && this.treeCooldowns[nearestIndex] && now - this.treeCooldowns[nearestIndex] < TREE_SHAKE_COOLDOWN_MS;

    if (nearestIndex >= 0 && !onCooldown) {
      this.treeCooldowns[nearestIndex] = now;
      const [tx, ty] = TREES[nearestIndex];
      this.shakeTreeVisual(nearestIndex);
      this.awardPoint('+1 🍃', tx, ty - 40);
    } else {
      this.triggerEmote(Math.floor(Math.random() * EMOTES.length));
    }
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
    const x = 1020;
    const y = 760;
    const w = 110;
    const h = 70;
    const g = this.add.graphics();
    g.fillStyle(0x8a5a3b, 1).fillRect(x, y, w, h);
    g.fillStyle(0xd9663b, 1).fillTriangle(x - 10, y, x + w + 10, y, x + w / 2, y - 45);
    g.fillStyle(0x5a3a22, 1).fillRect(x + w / 2 - 10, y + h - 28, 20, 28);
    g.fillStyle(0xcfe8f5, 1);
    g.fillRect(x + 16, y + 14, 20, 20);
    g.fillRect(x + w - 36, y + 14, 20, 20);
    g.setDepth(y + h);

    this.add.text(x + w / 2, y - 55, '🏠', { fontSize: '20px' }).setOrigin(0.5).setDepth(y + h + 1);
    this.addObstacleRect({ x, y: y + 20, width: w, height: h - 20 });
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

  addObstacleRect({ x, y, width, height }) {
    const rect = this.add.rectangle(x + width / 2, y + height / 2, width, height, 0x000000, 0).setVisible(false);
    this.physics.add.existing(rect, true);
    this.obstacles.push(rect);
  }

  // ---------- networking ----------

  registerNetHandlers() {
    this.net.on('playerJoined', (p) => {
      if (this.remotePlayers.has(p.id)) return;
      this.allPlayers.set(p.id, p);
      this.addRemotePlayer(p);
      this.renderPlayerList();
      this.addChatLine({ system: true, text: `${p.name} arrived in town.` });
    });

    this.net.on('playerLeft', (id) => {
      const p = this.allPlayers.get(id);
      this.allPlayers.delete(id);
      this.removeRemotePlayer(id);
      this.renderPlayerList();
      if (p) this.addChatLine({ system: true, text: `${p.name} left.` });
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
      li.textContent = `${label} — ⭐${p.score || 0}`;
      listEl.appendChild(li);
    });
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

let selectedSpecies = SPECIES[0].key;
let selectedFrame = 0;

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
