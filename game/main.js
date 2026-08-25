const FRAME_SIZE = 24;
const FRAME_COUNT = 9;
const HOP_HEIGHT = 5; // px of vertical lift at the peak of a walk hop
const HOP_SPEED = 9; // radians/sec the hop phase advances while moving
const SPECIES = [
  { key: 'coolcats', label: 'Cats' },
  { key: 'punks', label: 'Punks' },
  { key: 'pudgypenguins', label: 'Penguins' },
  { key: 'doge', label: 'Dogs' },
];

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

    this.registerNetHandlers();
    this.registerChatUI();
    this.renderPlayerList();
    this.addChatLine({ system: true, text: 'Welcome to Pixeltown! WASD or arrows to move, Enter to chat.' });

    // Handlers are wired up — safe to start receiving live updates now.
    this.net.startListening();
  }

  update(time, delta) {
    this.updateLocalMovement(time, delta);
    this.updateRemoteInterpolation(delta);
  }

  // ---------- movement ----------

  updateLocalMovement(time, delta) {
    const speed = 140;
    let vx = 0;
    let vy = 0;

    if (!this.chatFocused) {
      if (this.cursors.left.isDown || this.wasd.A.isDown) vx = -1;
      else if (this.cursors.right.isDown || this.wasd.D.isDown) vx = 1;

      if (this.cursors.up.isDown || this.wasd.W.isDown) vy = -1;
      else if (this.cursors.down.isDown || this.wasd.S.isDown) vy = 1;
    }

    if (vx !== 0 && vy !== 0) {
      vx *= 0.7071;
      vy *= 0.7071;
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
    TREES.forEach(([x, y]) => this.drawTree(x, y));
  }

  drawTree(x, y) {
    const g = this.add.graphics();
    g.fillStyle(0x5a3a22, 1).fillRect(x - 4, y - 4, 8, 16);
    g.fillStyle(0x3f8f4f, 1).fillCircle(x, y - 20, 17);
    g.fillStyle(0x4fa85f, 1).fillCircle(x - 11, y - 12, 13);
    g.fillStyle(0x4fa85f, 1).fillCircle(x + 11, y - 12, 13);
    g.fillStyle(0x5cb86a, 1).fillCircle(x, y - 28, 12);
    g.setDepth(y);
    this.addObstacleRect({ x: x - 5, y: y - 3, width: 10, height: 12 });
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

    this.net.on('playerMoved', (d) => {
      const rp = this.remotePlayers.get(d.id);
      if (!rp) return;
      rp.targetX = d.x;
      rp.targetY = d.y;
      rp.facing = d.facing;
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
        const text = chatInput.value.trim();
        if (text) this.net.sendChat(text);
        chatInput.value = '';
        chatInput.blur();
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
    this.allPlayers.forEach((p) => {
      const li = document.createElement('li');
      li.textContent = p.id === this.selfData.id ? `${p.name} (you)` : p.name;
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
