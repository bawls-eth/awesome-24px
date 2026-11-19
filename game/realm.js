// The Realm: a small top-down bullet-hell arena, entered through the Realm Gate in the village.
//
// Fully local (nothing here syncs over the network) and drawn with a plain 2D canvas in an overlay,
// the same way the cave overlay works. Everything that moves lives in a fixed-size pool (player
// bolts, enemy bullets, enemies, particles, floating numbers), so a long fight allocates nothing
// per frame, and every sprite is baked to an offscreen canvas once.
//
// Controls (twin-stick): WASD / arrows move, the mouse aims and holds-to-fire (or Space fires toward
// the pointer). On a touch screen the left stick moves and the right stick aims and fires.
//
// Three enemy patterns: Whirlers fire a steady spiral, Snipers fire aimed three-bolt bursts and
// circle you, Bursters drift in and fire rings. Survive waves, bank shards; dying costs 20% of the
// banked shards and sends you back to the village.

const RM_SHORT = 540; // logical arena short side; the long side follows the screen's shape
const RM_PLAYER = { speed: 235, r: 11, hp: 100, fireRate: 7.5, bulletSpeed: 580, bulletLife: 0.85, dmg: 1, iframes: 0.5 };
const RM_ENEMIES = {
  spiral: { name: 'Whirler', hp: 16, r: 17, shards: 3, color: '#b36bff', speed: 22 },
  aimed: { name: 'Sniper', hp: 8, r: 13, shards: 2, color: '#ff6b6b', speed: 80 },
  ring: { name: 'Burster', hp: 11, r: 15, shards: 2, color: '#ffb347', speed: 48 },
};
const RM_ENEMY_BULLET_DAMAGE = 8;
const RM_DEATH_PENALTY = 0.2; // share of the banked shards lost on death
const RM_POOL = { pBullets: 160, eBullets: 420, enemies: 24, particles: 180, texts: 28, bags: 14 };

// ---- progression (B2) ----
const RM_MAX_LEVEL = 20;
const RM_HP_PER_LEVEL = 8;
const RM_BACKPACK = 24; // items you can carry; extras are sold for shards on pickup
const RM_RARITIES = [
  { id: 'common', name: 'Common', mult: 1, color: '#c9d1d9', sell: 3 },
  { id: 'uncommon', name: 'Uncommon', mult: 1.6, color: '#7ee787', sell: 7 },
  { id: 'rare', name: 'Rare', mult: 2.4, color: '#79c0ff', sell: 15 },
];
// slot: weapon | charm | ring. Each item adds `stat` x rarity multiplier.
const RM_ITEMS = [
  { id: 'sparkwand', slot: 'weapon', name: 'Spark Wand', icon: '🪄', stat: 'dmg', amount: 0.5, text: 'damage' },
  { id: 'quickwand', slot: 'weapon', name: 'Quickfire Wand', icon: '⚡', stat: 'rate', amount: 1.5, text: 'shots/s' },
  { id: 'heartcharm', slot: 'charm', name: 'Hearty Charm', icon: '💖', stat: 'hp', amount: 12, text: 'max HP' },
  { id: 'swiftcharm', slot: 'charm', name: 'Swift Charm', icon: '👟', stat: 'speed', amount: 18, text: 'speed' },
  { id: 'luckring', slot: 'ring', name: 'Lucky Ring', icon: '💍', stat: 'shards', amount: 0.12, text: 'shard bonus', pct: true },
  { id: 'scholarring', slot: 'ring', name: 'Scholar Ring', icon: '📘', stat: 'xp', amount: 0.12, text: 'XP bonus', pct: true },
  { id: 'wardring', slot: 'ring', name: 'Warding Ring', icon: '🛡️', stat: 'iframes', amount: 0.1, text: 's safe time' },
];
const RM_ITEM_BY_ID = Object.create(null); // no inherited keys like __proto__ / constructor
RM_ITEMS.forEach((i) => { RM_ITEM_BY_ID[i.id] = i; });
const RM_SLOTS = ['weapon', 'charm', 'ring'];
const RM_BAG_CHANCE = 0.3;
const RM_XP = { spiral: 7, aimed: 4, ring: 5 };
const RM_ABILITIES = [
  { id: 'dash', key: 'q', icon: '💨', name: 'Dash', level: 1, cd: 3 },
  { id: 'nova', key: 'e', icon: '💥', name: 'Nova', level: 3, cd: 8 },
  { id: 'shield', key: 'r', icon: '🛡️', name: 'Shield', level: 5, cd: 14 },
  { id: 'overdrive', key: 'f', icon: '🔥', name: 'Overdrive', level: 7, cd: 20 },
];
function rmXpNeeded(level) { return 30 + 20 * (level - 1); }
const RM_WAVE_PAUSE = 2.4; // seconds between waves (shows the banner)

// Tiny seeded PRNG so a run can be reproduced in tests.
function rmRng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function rmCleanCount(v) {
  v = Math.floor(Number(v));
  return Number.isFinite(v) && v > 0 ? Math.min(v, 9999999) : 0;
}

// Everything read back from localStorage goes through here (additive fields: old saves load as level 1).
function rmCleanSave(s) {
  s = s && typeof s === 'object' ? s : {};
  const out = { shards: rmCleanCount(s.shards), bestWave: rmCleanCount(s.bestWave), kills: rmCleanCount(s.kills), deaths: rmCleanCount(s.deaths) };
  out.level = Math.max(1, Math.min(RM_MAX_LEVEL, rmCleanCount(s.level) || 1));
  out.xp = out.level >= RM_MAX_LEVEL ? 0 : Math.min(rmCleanCount(s.xp), rmXpNeeded(out.level) - 1);
  out.items = [];
  const seen = new Set();
  (Array.isArray(s.items) ? s.items.slice(0, 200) : []).forEach((it) => {
    if (out.items.length >= RM_BACKPACK || !it || typeof it !== 'object') return;
    const uid = rmCleanCount(it.n);
    const def = typeof it.id === 'string' ? RM_ITEM_BY_ID[it.id] : null;
    const rar = Math.floor(Number(it.r));
    if (!uid || seen.has(uid) || !def || !(rar >= 0 && rar < RM_RARITIES.length)) return;
    seen.add(uid);
    out.items.push({ n: uid, id: it.id, r: rar });
  });
  out.nextUid = Math.max(rmCleanCount(s.nextUid), 1 + out.items.reduce((m, it) => Math.max(m, it.n), 0));
  out.eq = {};
  const eq = s.eq && typeof s.eq === 'object' ? s.eq : {};
  RM_SLOTS.forEach((slot) => {
    const it = out.items.find((x) => x.n === rmCleanCount(eq[slot]));
    if (it && RM_ITEM_BY_ID[it.id].slot === slot) out.eq[slot] = it.n;
  });
  return out;
}

class RealmArena {
  constructor({ container, save, onSave, onExit, seed }) {
    this.container = container;
    this.onSave = onSave || (() => {});
    this.onExit = onExit || (() => {});
    this.save = rmCleanSave(save);
    this.rng = rmRng(seed === undefined ? (Date.now() & 0xffffffff) : seed);
    this.active = false;
    this.state = 'idle'; // idle | banner | play | dead
    this.W = 960; this.H = RM_SHORT;
    this.keys = {};
    this.moveVec = { x: 0, y: 0 }; // touch stick
    this.aimVec = { x: 0, y: 0, on: false };
    this.mouse = { x: 0, y: 0, down: false, seen: false };
    this.shake = 0;
    this.flash = 0; // red hit vignette
    this.run = { wave: 0, kills: 0, shards: 0 };
    this.displayShards = this.save.shards;
    this._avatar = null;

    this.canvas = document.createElement('canvas');
    this.canvas.id = 'realm-canvas';
    this.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    this._makePools();
    this._calcStats();
    this._bakeSprites();
    this._bindInput();
    this._resize();
  }

  // ---------- pools ----------

  _makePools() {
    const make = (n, f) => Array.from({ length: n }, f);
    this.pBullets = make(RM_POOL.pBullets, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0 }));
    this.eBullets = make(RM_POOL.eBullets, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, kind: 0 }));
    this.enemies = make(RM_POOL.enemies, () => ({ active: false, type: 'aimed', x: 0, y: 0, hp: 0, maxHp: 0, t: 0, cd: 0, angle: 0, flash: 0, ax: 0, ay: 0, dir: 1 }));
    this.particles = make(RM_POOL.particles, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, color: '#fff', size: 3 }));
    this.texts = make(RM_POOL.texts, () => ({ active: false, x: 0, y: 0, vy: 0, life: 0, text: '', color: '#fff' }));
    this.bags = make(RM_POOL.bags, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, t: 0, id: '', r: 0 }));
    this.abilityCd = [0, 0, 0, 0];
    this.shield = { hits: 0, t: 0 };
    this.overdriveT = 0;
    this.player = { x: 0, y: 0, hp: RM_PLAYER.hp, dashT: 0, iframes: 0, fireCd: 0, aim: 0, facing: 1, moving: false, bob: 0 };
  }

  _take(pool) {
    for (let i = 0; i < pool.length; i++) if (!pool[i].active) return pool[i];
    return null;
  }

  countActive(name) {
    let n = 0;
    const pool = this[name];
    for (let i = 0; i < pool.length; i++) if (pool[i].active) n++;
    return n;
  }

  // Stats = base + level + equipped items (recomputed when level / equipment changes, read every frame).
  _calcStats() {
    const st = { maxHp: RM_PLAYER.hp + RM_HP_PER_LEVEL * (this.save.level - 1), dmg: RM_PLAYER.dmg, rate: RM_PLAYER.fireRate, speed: RM_PLAYER.speed, shards: 1, xp: 1, iframes: RM_PLAYER.iframes };
    RM_SLOTS.forEach((slot) => {
      const uid = this.save.eq[slot];
      const it = uid && this.save.items.find((x) => x.n === uid);
      if (!it) return;
      const def = RM_ITEM_BY_ID[it.id]; const v = def.amount * RM_RARITIES[it.r].mult;
      if (def.stat === 'hp') st.maxHp += Math.round(v);
      else if (def.stat === 'dmg') st.dmg += v;
      else if (def.stat === 'rate') st.rate += v;
      else if (def.stat === 'speed') st.speed += v;
      else if (def.stat === 'shards') st.shards += v;
      else if (def.stat === 'xp') st.xp += v;
      else if (def.stat === 'iframes') st.iframes += v;
    });
    this.stats = st;
    return st;
  }

  // ---------- baked sprites ----------

  _bakeSprites() {
    const mk = (w, h, draw) => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      draw(c.getContext('2d'), w, h);
      return c;
    };
    this.sprites = {};
    // Arena floor: a dark chunky tiled pattern, drawn once and repeated.
    this.sprites.floor = mk(64, 64, (g) => {
      const rnd = rmRng(77);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        const v = 26 + Math.floor(rnd() * 10);
        g.fillStyle = `rgb(${v},${v - 8},${v + 24})`;
        g.fillRect(x * 16, y * 16, 16, 16);
        g.fillStyle = 'rgba(255,255,255,0.04)';
        g.fillRect(x * 16, y * 16, 16, 1);
        g.fillRect(x * 16, y * 16, 1, 16);
      }
    });
    this.sprites.pBullet = mk(16, 16, (g) => {
      const gr = g.createRadialGradient(8, 8, 1, 8, 8, 8);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.45, '#8fe9ff'); gr.addColorStop(1, 'rgba(60,160,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 16, 16);
    });
    const ebCols = [['#ffffff', '#ff6f91'], ['#ffffff', '#c58bff'], ['#ffffff', '#ffc65c']];
    this.sprites.eBullet = ebCols.map(([a, b]) => mk(16, 16, (g) => {
      const gr = g.createRadialGradient(8, 8, 1, 8, 8, 8);
      gr.addColorStop(0, a); gr.addColorStop(0.4, b); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 16, 16);
    }));
    // Enemies: chunky pixel creatures with a bold dark outline, ~36px.
    const body = (g, color, shape) => {
      g.fillStyle = '#1a0f2a';
      shape(g, 2);
      g.fillStyle = color;
      shape(g, 0);
    };
    this.sprites.spiral = mk(44, 44, (g) => body(g, RM_ENEMIES.spiral.color, (c, pad) => {
      c.beginPath(); c.arc(22, 22, 16 + pad, 0, Math.PI * 2); c.fill();
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; c.beginPath(); c.arc(22 + Math.cos(a) * 17, 22 + Math.sin(a) * 17, 4 + pad, 0, Math.PI * 2); c.fill(); }
    }) || (g.fillStyle = '#fff', g.fillRect(16, 18, 4, 5), g.fillRect(25, 18, 4, 5), g.fillStyle = '#2a1245', g.fillRect(18, 20, 2, 3), g.fillRect(27, 20, 2, 3), g.fillRect(19, 28, 7, 2)));
    this.sprites.aimed = mk(36, 36, (g) => body(g, RM_ENEMIES.aimed.color, (c, pad) => {
      c.beginPath(); c.moveTo(18, 3 - pad); c.lineTo(33 + pad, 30 + pad); c.lineTo(3 - pad, 30 + pad); c.closePath(); c.fill();
    }) || (g.fillStyle = '#fff', g.fillRect(12, 18, 4, 5), g.fillRect(21, 18, 4, 5), g.fillStyle = '#3a0f0f', g.fillRect(14, 20, 2, 3), g.fillRect(23, 20, 2, 3)));
    this.sprites.ring = mk(40, 40, (g) => body(g, RM_ENEMIES.ring.color, (c, pad) => {
      c.beginPath(); c.arc(20, 20, 15 + pad, 0, Math.PI * 2); c.fill();
      c.fillRect(4 - pad, 18 - pad, 32 + pad * 2, 5 + pad * 2);
    }) || (g.fillStyle = '#fff', g.fillRect(13, 14, 5, 5), g.fillRect(22, 14, 5, 5), g.fillStyle = '#3a2a0f', g.fillRect(15, 16, 2, 3), g.fillRect(24, 16, 2, 3)));
    this.sprites.bag = RM_RARITIES.map((r) => mk(26, 26, (g) => {
      const gr = g.createRadialGradient(13, 13, 2, 13, 13, 13);
      gr.addColorStop(0, r.color); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = 0.55; g.fillStyle = gr; g.fillRect(0, 0, 26, 26); g.globalAlpha = 1;
      g.fillStyle = '#1a0f2a'; g.fillRect(6, 9, 14, 12); g.fillRect(9, 6, 8, 4);
      g.fillStyle = r.color; g.fillRect(7, 10, 12, 10); g.fillRect(10, 7, 6, 3);
      g.fillStyle = '#fff'; g.fillRect(11, 13, 4, 4);
    }));
    this.sprites.playerFallback = mk(32, 32, (g) => {
      g.fillStyle = '#1a2a1a'; g.beginPath(); g.arc(16, 16, 13, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#6fbf73'; g.beginPath(); g.arc(16, 16, 11, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff'; g.fillRect(11, 13, 4, 5); g.fillRect(18, 13, 4, 5);
    });
  }

  // Draws one frame of the villager's sprite strip (same art as the 2D town and the cave avatar).
  setAvatar(url, frame, frameSize) {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = frameSize; c.height = frameSize;
      c.getContext('2d').drawImage(img, frame * frameSize, 0, frameSize, frameSize, 0, 0, frameSize, frameSize);
      this._avatar = c;
    };
    img.src = url;
  }

  // ---------- input ----------

  _bindInput() {
    this.onKeyDown = (e) => {
      if (!this.active) return;
      const k = e.key.toLowerCase();
      if (k === 'escape') { e.preventDefault(); if (this.paused) this.setPaused(false); else this.leave(); return; }
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      if (!e.repeat) {
        const ai = RM_ABILITIES.findIndex((a) => a.key === k);
        if (ai >= 0) { this.cast(ai); return; }
        if (k === 'b' || k === 'i') { this.setPaused(!this.paused); return; }
      }
      this.keys[k] = true;
    };
    this.onKeyUp = (e) => { this.keys[e.key.toLowerCase()] = false; };
    this.onBlur = () => { this.keys = {}; this.mouse.down = false; };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);

    const toArena = (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - r.left) / r.width) * this.W;
      this.mouse.y = ((e.clientY - r.top) / r.height) * this.H;
      this.mouse.seen = true;
    };
    this.onPointerMove = (e) => { if (e.pointerType === 'mouse') toArena(e); };
    this.onPointerDown = (e) => { if (e.pointerType === 'mouse') { toArena(e); this.mouse.down = true; } };
    this.onPointerUp = (e) => { if (e.pointerType === 'mouse') this.mouse.down = false; };
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.onResize = () => { if (this.active) this._resize(); };
    window.addEventListener('resize', this.onResize);
  }

  // Touch sticks are DOM elements (set up by main.js); they only feed these two vectors.
  setMoveStick(x, y) { this.moveVec.x = x; this.moveVec.y = y; }
  setAimStick(x, y, on) { this.aimVec.x = x; this.aimVec.y = y; this.aimVec.on = !!on; }

  _resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    const aspect = w / h;
    // Short side is always RM_SHORT logical units; the long side follows the screen.
    if (aspect >= 1) { this.H = RM_SHORT; this.W = Math.round(Math.min(1400, Math.max(RM_SHORT, RM_SHORT * aspect))); } else { this.W = RM_SHORT; this.H = Math.round(Math.min(1400, Math.max(RM_SHORT, RM_SHORT / aspect))); }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.W * Math.min(dpr, 1.5));
    this.canvas.height = Math.round(this.H * Math.min(dpr, 1.5));
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.scale = this.canvas.width / this.W;
    this._vignette = null; // rebuilt for the new size on next draw
    const p = this.player;
    p.x = Math.max(RM_PLAYER.r, Math.min(this.W - RM_PLAYER.r, p.x || this.W / 2));
    p.y = Math.max(RM_PLAYER.r, Math.min(this.H - RM_PLAYER.r, p.y || this.H / 2));
  }

  // ---------- lifecycle ----------

  start() {
    this.active = true;
    this._resize();
    [this.pBullets, this.eBullets, this.enemies, this.particles, this.texts, this.bags].forEach((pool) => pool.forEach((o) => { o.active = false; }));
    this.keys = {}; this.mouse.down = false; this.moveVec.x = 0; this.moveVec.y = 0; this.aimVec.on = false; this.aimVec.x = 0; this.aimVec.y = 0; // no stuck input from the last run
    const p = this.player;
    this._calcStats();
    this.abilityCd = [0, 0, 0, 0]; this.shield.hits = 0; this.shield.t = 0; this.overdriveT = 0; this.paused = false;
    p.x = this.W / 2; p.y = this.H / 2; p.hp = this.stats.maxHp; p.dashT = 0; p.iframes = 1; p.fireCd = 0; p.aim = -Math.PI / 2;
    this.run = { wave: 0, kills: 0, shards: 0 };
    this.shake = 0; this.flash = 0;
    this.displayShards = this.save.shards;
    this.state = 'banner';
    this.bannerT = 1.4;
    this.bannerText = 'Realm — survive the waves!';
    this.nextWaveIn = 1.4;
    this._syncHud(true);
    this._showBanner(this.bannerText);
    this._lastT = performance.now();
    this._raf = requestAnimationFrame(this._loop);
  }

  stop() {
    this.active = false;
    this.keys = {};
    this.mouse.down = false;
    this.aimVec.on = false; this.moveVec.x = 0; this.moveVec.y = 0;
    if (this._raf) cancelAnimationFrame(this._raf);
    clearTimeout(this._bannerTimer);
    this.setPaused(false); // never leave the backpack covering a stopped run
    this._hideBanner();
  }

  destroy() {
    this.stop();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('resize', this.onResize);
    if (this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
  }

  // Leave on your own terms: no penalty, shards stay banked.
  leave() {
    if (!this.active) return;
    this._finishRun();
    this.stop();
    this.onExit('leave');
  }

  _finishRun() {
    this.onSave(this.save);
  }

  _loop = (now) => {
    if (!this.active) return;
    const dt = Math.min((now - this._lastT) / 1000, 0.05);
    this._lastT = now;
    this._update(dt);
    this._draw();
    if (this.active) this._raf = requestAnimationFrame(this._loop); // a death exit inside _update must not leave a second loop
  };

  // ---------- spawning ----------

  enemiesAlive() { return this.countActive('enemies'); }

  spawnEnemy(type, x, y) {
    const e = this._take(this.enemies);
    if (!e) return null;
    const def = RM_ENEMIES[type];
    const scale = 1 + 0.15 * Math.max(0, this.run.wave - 1);
    e.active = true; e.type = type; e.x = x; e.y = y;
    e.maxHp = Math.ceil(def.hp * scale); e.hp = e.maxHp;
    e.t = 0; e.flash = 0; e.angle = this.rng() * Math.PI * 2; e.dir = this.rng() < 0.5 ? 1 : -1;
    e.cd = 0.8 + this.rng() * 0.8; // first shot is never instant
    e.ax = 80 + this.rng() * (this.W - 160); e.ay = 80 + this.rng() * (this.H - 160); // drift target for Whirlers
    return e;
  }

  _startWave() {
    this.run.wave += 1;
    const n = Math.min(2 + this.run.wave, 10);
    const order = ['aimed', 'ring', 'spiral'];
    for (let i = 0; i < n; i++) {
      const type = this.run.wave === 1 ? ['aimed', 'aimed', 'ring'][i % 3] : order[(i + Math.floor(this.rng() * 3)) % 3];
      // Spawn on the arena rim, away from the player.
      let x; let y; let tries = 0;
      do {
        const a = this.rng() * Math.PI * 2;
        x = this.W / 2 + Math.cos(a) * (this.W / 2 - 40);
        y = this.H / 2 + Math.sin(a) * (this.H / 2 - 40);
      } while (Math.hypot(x - this.player.x, y - this.player.y) < 220 && ++tries < 12);
      this.spawnEnemy(type, x, y);
    }
    this.state = 'play';
    this._showBanner(`Wave ${this.run.wave}`, 1.1);
    this._syncHud();
  }

  fireEnemyBullet(x, y, angle, speed, kind) {
    const b = this._take(this.eBullets);
    if (!b) return;
    b.active = true; b.x = x; b.y = y; b.vx = Math.cos(angle) * speed; b.vy = Math.sin(angle) * speed; b.life = 6; b.kind = kind || 0;
  }

  firePlayerBullet(angle) {
    const b = this._take(this.pBullets);
    if (!b) return;
    const p = this.player;
    b.active = true; b.x = p.x + Math.cos(angle) * 14; b.y = p.y + Math.sin(angle) * 14;
    b.vx = Math.cos(angle) * RM_PLAYER.bulletSpeed; b.vy = Math.sin(angle) * RM_PLAYER.bulletSpeed; b.life = RM_PLAYER.bulletLife;
  }

  _burst(x, y, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const pt = this._take(this.particles);
      if (!pt) return;
      const a = this.rng() * Math.PI * 2; const sp = speed * (0.3 + this.rng() * 0.7);
      pt.active = true; pt.x = x; pt.y = y; pt.vx = Math.cos(a) * sp; pt.vy = Math.sin(a) * sp; pt.life = pt.max = 0.35 + this.rng() * 0.35; pt.color = color; pt.size = 2 + Math.floor(this.rng() * 3);
    }
  }

  _floatText(x, y, text, color) {
    const t = this._take(this.texts);
    if (!t) return;
    t.active = true; t.x = x; t.y = y; t.vy = -48; t.life = 0.7; t.text = text; t.color = color;
  }

  // ---------- simulation ----------

  _update(dt) {
    if (this.paused) return; // backpack open
    const p = this.player;
    this.shake = Math.max(0, this.shake - dt * 30);
    this.flash = Math.max(0, this.flash - dt * 2.2);
    if (this.displayShards !== this.save.shards) { // the shard counter ticks up (or down) instead of jumping
      const d = this.save.shards - this.displayShards;
      this.displayShards += Math.sign(d) * Math.max(1, Math.ceil(Math.abs(d) * Math.min(1, dt * 6)));
      if (Math.sign(this.save.shards - this.displayShards) !== Math.sign(d)) this.displayShards = this.save.shards;
      this._syncHud();
    }

    // Particles and floating numbers keep animating in every state.
    for (let i = 0; i < this.particles.length; i++) {
      const pt = this.particles[i];
      if (!pt.active) continue;
      pt.life -= dt;
      if (pt.life <= 0) { pt.active = false; continue; }
      pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vx *= 0.94; pt.vy *= 0.94;
    }
    for (let i = 0; i < this.texts.length; i++) {
      const t = this.texts[i];
      if (!t.active) continue;
      t.life -= dt;
      if (t.life <= 0) { t.active = false; continue; }
      t.y += t.vy * dt;
    }

    if (this.state === 'dead') {
      this.deadT -= dt;
      if (this.deadT <= 0) { this.stop(); this.onExit('death'); }
      return;
    }

    this._updatePlayer(dt);
    if (this.state === 'banner') {
      this.nextWaveIn -= dt;
      if (this.nextWaveIn <= 0) this._startWave();
    }
    this._updateAbilities(dt);
    this._updateEnemies(dt);
    this._updateBullets(dt);
    this._updateBags(dt);
    if (this.state === 'play' && this.run.wave > 0 && this.enemiesAlive() === 0) this._waveCleared();
  }

  _updatePlayer(dt) {
    const p = this.player;
    p.iframes = Math.max(0, p.iframes - dt);
    let mx = this.moveVec.x; let my = this.moveVec.y;
    if (this.keys.a || this.keys.arrowleft) mx -= 1;
    if (this.keys.d || this.keys.arrowright) mx += 1;
    if (this.keys.w || this.keys.arrowup) my -= 1;
    if (this.keys.s || this.keys.arrowdown) my += 1;
    const len = Math.hypot(mx, my);
    p.moving = len > 0.05;
    if (len > 1) { mx /= len; my /= len; }
    p.x = Math.max(RM_PLAYER.r, Math.min(this.W - RM_PLAYER.r, p.x + mx * this.stats.speed * dt));
    p.y = Math.max(RM_PLAYER.r, Math.min(this.H - RM_PLAYER.r, p.y + my * this.stats.speed * dt));
    this._mx = mx; this._my = my;
    if (mx) p.facing = mx > 0 ? 1 : -1;
    p.bob = p.moving ? p.bob + dt * 14 : 0;

    // Twin-stick aim: the right stick wins, otherwise the mouse pointer.
    let firing = false;
    if (this.aimVec.on && Math.hypot(this.aimVec.x, this.aimVec.y) > 0.25) { p.aim = Math.atan2(this.aimVec.y, this.aimVec.x); firing = true; } else if (this.mouse.seen) {
      p.aim = Math.atan2(this.mouse.y - p.y, this.mouse.x - p.x);
      firing = this.mouse.down || !!this.keys[' '];
    } else if (this.keys[' ']) firing = true;
    p.fireCd -= dt;
    if (firing && p.fireCd <= 0 && this.state !== 'dead') {
      p.fireCd = 1 / (this.stats.rate * (this.overdriveT > 0 ? 2 : 1));
      this.firePlayerBullet(p.aim);
    }
  }

  _updateEnemies(dt) {
    const p = this.player;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (!e.active) continue;
      e.t += dt; e.flash = Math.max(0, e.flash - dt * 6); e.cd -= dt;
      const dx = p.x - e.x; const dy = p.y - e.y; const dist = Math.hypot(dx, dy) || 1;
      if (e.type === 'spiral') {
        // Drifts toward its anchor and keeps spinning out a steady spiral.
        const ax = e.ax - e.x; const ay = e.ay - e.y; const ad = Math.hypot(ax, ay);
        if (ad > 8) { e.x += (ax / ad) * RM_ENEMIES.spiral.speed * dt; e.y += (ay / ad) * RM_ENEMIES.spiral.speed * dt; }
        if (e.cd <= 0) { e.cd = 0.09; e.angle += 0.47; this.fireEnemyBullet(e.x, e.y, e.angle, 150, 1); }
      } else if (e.type === 'aimed') {
        // Circles the player at a distance and fires aimed three-bolt bursts.
        const want = dist > 280 ? 1 : dist < 200 ? -1 : 0;
        const tx = -dy / dist * e.dir; const ty = dx / dist * e.dir;
        e.x += ((dx / dist) * want * 0.7 + tx) * RM_ENEMIES.aimed.speed * dt;
        e.y += ((dy / dist) * want * 0.7 + ty) * RM_ENEMIES.aimed.speed * dt;
        if (e.cd <= 0) {
          e.cd = 1.3;
          const a = Math.atan2(dy, dx);
          for (let k = -1; k <= 1; k++) this.fireEnemyBullet(e.x, e.y, a + k * 0.22, 235, 0);
        }
      } else {
        // Drifts in and fires a ring of bolts with a random phase.
        if (dist > 150) { e.x += (dx / dist) * RM_ENEMIES.ring.speed * dt; e.y += (dy / dist) * RM_ENEMIES.ring.speed * dt; }
        if (e.cd <= 0) {
          e.cd = 2.4;
          const phase = this.rng() * Math.PI * 2;
          for (let k = 0; k < 14; k++) this.fireEnemyBullet(e.x, e.y, phase + (k / 14) * Math.PI * 2, 140, 2);
        }
      }
      e.x = Math.max(20, Math.min(this.W - 20, e.x));
      e.y = Math.max(20, Math.min(this.H - 20, e.y));
    }
  }

  _updateBullets(dt) {
    const p = this.player;
    // Player bolts: move, hit enemies.
    for (let i = 0; i < this.pBullets.length; i++) {
      const b = this.pBullets[i];
      if (!b.active) continue;
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0 || b.x < -10 || b.y < -10 || b.x > this.W + 10 || b.y > this.H + 10) { b.active = false; continue; }
      for (let j = 0; j < this.enemies.length; j++) {
        const e = this.enemies[j];
        if (!e.active) continue;
        const r = RM_ENEMIES[e.type].r + 5;
        if ((b.x - e.x) * (b.x - e.x) + (b.y - e.y) * (b.y - e.y) < r * r) {
          b.active = false;
          this._hitEnemy(e, this.stats.dmg);
          break;
        }
      }
    }
    // Enemy bullets: move, hit the player.
    const pr = RM_PLAYER.r + 4;
    for (let i = 0; i < this.eBullets.length; i++) {
      const b = this.eBullets[i];
      if (!b.active) continue;
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0 || b.x < -20 || b.y < -20 || b.x > this.W + 20 || b.y > this.H + 20) { b.active = false; continue; }
      if (this.state !== 'dead' && p.iframes <= 0 && (b.x - p.x) * (b.x - p.x) + (b.y - p.y) * (b.y - p.y) < pr * pr) {
        b.active = false;
        this._hitPlayer(RM_ENEMY_BULLET_DAMAGE);
      }
    }
  }

  _hitEnemy(e, dmg) {
    e.hp -= dmg; e.flash = 1;
    this._floatText(e.x + (this.rng() - 0.5) * 14, e.y - 14, String(Math.round(dmg * 10) / 10), '#fff');
    this._burst(e.x, e.y, RM_ENEMIES[e.type].color, 3, 110);
    if (e.hp > 0) return;
    e.active = false;
    const def = RM_ENEMIES[e.type];
    const gain = Math.max(1, Math.round(def.shards * this.stats.shards));
    this.run.kills += 1; this.run.shards += gain;
    this.save.kills += 1; this.save.shards += gain;
    this._burst(e.x, e.y, def.color, 16, 230);
    this._floatText(e.x, e.y - 22, `+${gain} 💎`, '#8fe9ff');
    this._gainXp(Math.round(RM_XP[e.type] * (1 + 0.1 * Math.max(0, this.run.wave - 1)) * this.stats.xp));
    if (this.rng() < RM_BAG_CHANCE) this.dropBag(e.x, e.y, this.rollRarity());
    this.shake = Math.max(this.shake, 3);
    this.onSave(this.save);
  }

  _hitPlayer(dmg) {
    const p = this.player;
    if (this.shield.hits > 0) { // Shield soaks the hit
      this.shield.hits -= 1; p.iframes = 0.25; this._burst(p.x, p.y, '#8fe9ff', 6, 140); this._floatText(p.x, p.y - 22, 'blocked', '#8fe9ff'); return;
    }
    p.hp = Math.max(0, p.hp - dmg);
    p.iframes = this.stats.iframes;
    this.flash = 1; this.shake = Math.max(this.shake, 8);
    this._burst(p.x, p.y, '#ff6f91', 8, 160);
    this._floatText(p.x, p.y - 22, `-${dmg}`, '#ff6f91');
    this._syncHud();
    if (p.hp <= 0) this._die();
  }

  _waveCleared() {
    const bonus = 5 * this.run.wave;
    this.run.shards += bonus; this.save.shards += bonus;
    this.save.bestWave = Math.max(this.save.bestWave, this.run.wave);
    this.onSave(this.save);
    this.state = 'banner';
    this.nextWaveIn = RM_WAVE_PAUSE;
    this.eBullets.forEach((b) => { if (b.active) { b.active = false; this._burst(b.x, b.y, '#8fe9ff', 1, 40); } }); // clearing a wave pops the leftover bolts
    this._showBanner(`Wave ${this.run.wave} cleared!  +${bonus} 💎`, RM_WAVE_PAUSE - 0.2);
    this._burst(this.W / 2, this.H / 2, '#ffe27a', 24, 280);
    this._syncHud();
  }

  _die() {
    const lost = Math.floor(this.save.shards * RM_DEATH_PENALTY);
    this.save.shards -= lost;
    this.save.deaths += 1;
    this.save.bestWave = Math.max(this.save.bestWave, this.run.wave - 1);
    this.lastLoss = lost;
    this.state = 'dead';
    this.deadT = 2.6;
    this.shake = 14;
    this._burst(this.player.x, this.player.y, '#ff6f91', 30, 300);
    this._showBanner(`You fell in the Realm…  lost ${lost} 💎`, 2.6);
    this.onSave(this.save);
    this._syncHud();
  }

  // ---------- XP, levels, loot ----------

  _gainXp(n) {
    const sv = this.save;
    if (sv.level >= RM_MAX_LEVEL || n <= 0) return;
    sv.xp += n;
    this._floatText(this.player.x, this.player.y - 34, `+${n} xp`, '#c9a7ff');
    let up = false;
    while (sv.level < RM_MAX_LEVEL && sv.xp >= rmXpNeeded(sv.level)) { sv.xp -= rmXpNeeded(sv.level); sv.level += 1; up = true; }
    if (sv.level >= RM_MAX_LEVEL) sv.xp = 0;
    if (up) this._levelUp();
    this.onSave(this.save);
    this._syncHud();
  }

  _levelUp() {
    const before = this.stats.maxHp;
    this._calcStats();
    const p = this.player;
    p.hp = Math.min(this.stats.maxHp, p.hp + Math.round(this.stats.maxHp * 0.3) + (this.stats.maxHp - before)); // a level heals a bit and the new max HP is free
    this.shake = Math.max(this.shake, 4);
    this._burst(p.x, p.y, '#ffe27a', 28, 260);
    const unlocked = RM_ABILITIES.filter((a) => a.level === this.save.level);
    this._showBanner(`Level ${this.save.level}!${unlocked.length ? `  ${unlocked[0].icon} ${unlocked[0].name} unlocked` : ''}`, 2);
    this._syncAbilities();
  }

  rollRarity() {
    const w = this.run.wave;
    const r = this.rng();
    const rare = Math.min(0.2, 0.02 + 0.02 * w); const unc = Math.min(0.4, 0.15 + 0.04 * w);
    return r < rare ? 2 : r < rare + unc ? 1 : 0;
  }

  dropBag(x, y, rarity, itemId) {
    const b = this._take(this.bags);
    if (!b) return null;
    b.active = true; b.x = x; b.y = y; b.t = 0; b.r = rarity;
    b.id = itemId || RM_ITEMS[Math.floor(this.rng() * RM_ITEMS.length)].id;
    const a = this.rng() * Math.PI * 2; b.vx = Math.cos(a) * 60; b.vy = Math.sin(a) * 60;
    return b;
  }

  // Picks an item up. A full backpack sells it on the spot for shards.
  collectItem(id, rarity) {
    const sv = this.save; const def = RM_ITEM_BY_ID[id]; const rar = RM_RARITIES[rarity];
    if (sv.items.length >= RM_BACKPACK) {
      sv.shards += rar.sell;
      this._floatText(this.player.x, this.player.y - 24, `sold ${def.name} +${rar.sell} 💎`, rar.color);
    } else {
      sv.items.push({ n: sv.nextUid++, id, r: rarity });
      this._floatText(this.player.x, this.player.y - 24, `${def.icon} ${def.name}`, rar.color);
      this._burst(this.player.x, this.player.y, rar.color, 10, 150);
    }
    this.onSave(this.save);
    this._syncHud(); if (this.paused) this.renderBackpack();
  }

  _updateBags(dt) {
    const p = this.player;
    for (let i = 0; i < this.bags.length; i++) {
      const b = this.bags[i];
      if (!b.active) continue;
      b.t += dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.vx *= 0.93; b.vy *= 0.93;
      b.x = Math.max(14, Math.min(this.W - 14, b.x)); b.y = Math.max(14, Math.min(this.H - 14, b.y));
      const dx = p.x - b.x; const dy = p.y - b.y; const d = Math.hypot(dx, dy) || 1;
      if (b.t > 0.4 && d < 110) { const k = (230 * dt) / d; b.x += dx * k; b.y += dy * k; } // bags drift toward you
      if (b.t > 0.25 && d < 20) { b.active = false; this.collectItem(b.id, b.r); }
    }
  }

  // ---------- abilities ----------

  abilityUnlocked(i) { return this.save.level >= RM_ABILITIES[i].level; }

  cast(i) {
    if (!this.active || this.state === 'dead' || this.paused) return false;
    const ab = RM_ABILITIES[i];
    if (!ab || !this.abilityUnlocked(i) || this.abilityCd[i] > 0) return false;
    const p = this.player;
    if (ab.id === 'dash') {
      let dx = this._mx || 0; let dy = this._my || 0;
      if (Math.hypot(dx, dy) < 0.1) { dx = Math.cos(p.aim); dy = Math.sin(p.aim); }
      const len = Math.hypot(dx, dy) || 1;
      this._burst(p.x, p.y, '#8fe9ff', 8, 120);
      p.x = Math.max(RM_PLAYER.r, Math.min(this.W - RM_PLAYER.r, p.x + (dx / len) * 150));
      p.y = Math.max(RM_PLAYER.r, Math.min(this.H - RM_PLAYER.r, p.y + (dy / len) * 150));
      p.iframes = Math.max(p.iframes, 0.4);
    } else if (ab.id === 'nova') {
      for (let k = 0; k < 16; k++) this.firePlayerBullet((k / 16) * Math.PI * 2);
      this.shake = Math.max(this.shake, 3);
    } else if (ab.id === 'shield') {
      this.shield.hits = 3; this.shield.t = 6;
    } else if (ab.id === 'overdrive') {
      this.overdriveT = 4;
    }
    this.abilityCd[i] = ab.cd;
    this._floatText(p.x, p.y - 30, `${ab.icon} ${ab.name}`, '#fff');
    this._syncAbilities();
    return true;
  }

  _updateAbilities(dt) {
    let changed = false;
    for (let i = 0; i < 4; i++) if (this.abilityCd[i] > 0) { this.abilityCd[i] = Math.max(0, this.abilityCd[i] - dt); changed = true; }
    if (this.overdriveT > 0) this.overdriveT = Math.max(0, this.overdriveT - dt);
    if (this.shield.t > 0) { this.shield.t -= dt; if (this.shield.t <= 0) this.shield.hits = 0; }
    this._abTick = (this._abTick || 0) + dt;
    if (changed && this._abTick > 0.1) { this._abTick = 0; this._syncAbilities(); }
  }

  // ---------- backpack UI ----------

  setPaused(on) {
    this.paused = !!on;
    const el = document.getElementById('realm-backpack');
    if (el) el.classList.toggle('hidden', !on);
    if (on) { this.keys = {}; this.mouse.down = false; this.renderBackpack(); }
  }

  equip(uid) {
    const it = this.save.items.find((x) => x.n === uid);
    if (!it) return false;
    const slot = RM_ITEM_BY_ID[it.id].slot;
    if (this.save.eq[slot] === uid) delete this.save.eq[slot]; else this.save.eq[slot] = uid;
    this._afterGearChange();
    return true;
  }

  discard(uid) {
    const i = this.save.items.findIndex((x) => x.n === uid);
    if (i < 0) return false;
    const it = this.save.items[i];
    this.save.shards += RM_RARITIES[it.r].sell;
    this.save.items.splice(i, 1);
    RM_SLOTS.forEach((slot) => { if (this.save.eq[slot] === uid) delete this.save.eq[slot]; });
    this._afterGearChange();
    return true;
  }

  _afterGearChange() {
    this._calcStats();
    const p = this.player;
    p.hp = Math.min(this.stats.maxHp, p.hp); // swapping gear never heals (no free HP by toggling a charm); losing max HP just lowers the cap
    this.displayShards = this.save.shards;
    this.onSave(this.save);
    this._syncHud(); this.renderBackpack();
  }

  _statLine() {
    const st = this.stats; const bits = [`${st.maxHp} HP`, `${(Math.round(st.dmg * 10) / 10)} dmg`, `${(Math.round(st.rate * 10) / 10)} shots/s`, `${Math.round(st.speed)} speed`];
    if (st.shards > 1) bits.push(`+${Math.round((st.shards - 1) * 100)}% 💎`);
    if (st.xp > 1) bits.push(`+${Math.round((st.xp - 1) * 100)}% xp`);
    return bits.join(' · ');
  }

  _itemText(it) {
    const def = RM_ITEM_BY_ID[it.id]; const v = def.amount * RM_RARITIES[it.r].mult;
    const num = def.pct ? `+${Math.round(v * 100)}%` : `+${Math.round(v * 10) / 10}`;
    return `${num} ${def.text}`;
  }

  renderBackpack() {
    const root = document.getElementById('realm-backpack-body');
    if (!root) return;
    const sv = this.save;
    const eqUids = new Set(RM_SLOTS.map((sl) => sv.eq[sl]).filter(Boolean));
    let html = `<div id="realm-bp-stats">${this._statLine()}</div><div class="realm-bp-slots">`;
    RM_SLOTS.forEach((slot) => {
      const it = sv.items.find((x) => x.n === sv.eq[slot]);
      html += `<div class="realm-bp-slot" data-slot="${slot}">${it ? `<span style="color:${RM_RARITIES[it.r].color}">${RM_ITEM_BY_ID[it.id].icon} ${RM_ITEM_BY_ID[it.id].name}</span>` : `<span class="dim">${slot}: empty</span>`}</div>`;
    });
    html += `</div><div class="realm-bp-count">${sv.items.length} / ${RM_BACKPACK} items</div><ul id="realm-bp-list">`;
    if (!sv.items.length) html += '<li class="dim">Nothing yet — defeat enemies to find loot bags.</li>';
    sv.items.forEach((it) => {
      const def = RM_ITEM_BY_ID[it.id]; const rar = RM_RARITIES[it.r]; const on = eqUids.has(it.n);
      html += `<li data-uid="${it.n}" class="${on ? 'on' : ''}"><span class="nm" style="color:${rar.color}">${def.icon} ${def.name}</span><span class="rar">${rar.name}</span><span class="st">${this._itemText(it)}</span><button type="button" class="eq" data-act="equip" data-uid="${it.n}">${on ? 'Unequip' : 'Equip'}</button><button type="button" class="dc" data-act="discard" data-uid="${it.n}" aria-label="Sell ${def.name} for ${rar.sell} shards">Sell ${rar.sell}💎</button></li>`;
    });
    html += '</ul>';
    root.innerHTML = html;
  }

  // ---------- drawing ----------

  _draw() {
    const g = this.ctx; const s = this.scale;
    g.setTransform(s, 0, 0, s, 0, 0);
    g.imageSmoothingEnabled = false;
    const sx = this.shake > 0 ? (this.rng() - 0.5) * this.shake : 0;
    const sy = this.shake > 0 ? (this.rng() - 0.5) * this.shake : 0;
    g.save();
    g.translate(sx, sy);
    if (!this._floorPattern) this._floorPattern = g.createPattern(this.sprites.floor, 'repeat');
    g.fillStyle = this._floorPattern; g.fillRect(-10, -10, this.W + 20, this.H + 20);
    g.strokeStyle = 'rgba(179,107,255,0.55)'; g.lineWidth = 4; g.strokeRect(2, 2, this.W - 4, this.H - 4);

    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (!e.active) continue;
      const spr = this.sprites[e.type];
      const bob = Math.sin(e.t * 4) * 2;
      g.drawImage(spr, e.x - spr.width / 2, e.y - spr.height / 2 + bob);
      if (e.flash > 0) { g.globalAlpha = e.flash * 0.7; g.fillStyle = '#fff'; g.beginPath(); g.arc(e.x, e.y + bob, RM_ENEMIES[e.type].r, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; }
      if (e.hp < e.maxHp) { g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(e.x - 14, e.y - spr.height / 2 - 6, 28, 4); g.fillStyle = RM_ENEMIES[e.type].color; g.fillRect(e.x - 14, e.y - spr.height / 2 - 6, 28 * (e.hp / e.maxHp), 4); }
    }
    for (let i = 0; i < this.bags.length; i++) { const b = this.bags[i]; if (b.active) g.drawImage(this.sprites.bag[b.r], b.x - 13, b.y - 13 + Math.sin(b.t * 5) * 2); }
    for (let i = 0; i < this.eBullets.length; i++) { const b = this.eBullets[i]; if (b.active) g.drawImage(this.sprites.eBullet[b.kind], b.x - 8, b.y - 8); }
    for (let i = 0; i < this.pBullets.length; i++) { const b = this.pBullets[i]; if (b.active) g.drawImage(this.sprites.pBullet, b.x - 8, b.y - 8); }

    // Player: the villager sprite (flickers while invulnerable), with a soft shadow and aim marker.
    const p = this.player;
    if (this.state !== 'dead' && (p.iframes <= 0 || Math.floor(p.iframes * 20) % 2 === 0)) {
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(p.x, p.y + 14, 13, 5, 0, 0, Math.PI * 2); g.fill();
      const spr = this._avatar || this.sprites.playerFallback;
      const size = this._avatar ? 48 : 32;
      g.save(); g.translate(p.x, p.y - Math.abs(Math.sin(p.bob)) * 3);
      g.scale(p.facing, 1);
      g.drawImage(spr, -size / 2, -size / 2 - 4, size, size);
      g.restore();
      if (this.shield.hits > 0) { g.strokeStyle = `rgba(143,233,255,${0.5 + 0.1 * this.shield.hits})`; g.lineWidth = 3; g.beginPath(); g.arc(p.x, p.y, 26, 0, Math.PI * 2); g.stroke(); }
      if (this.overdriveT > 0) { g.strokeStyle = 'rgba(255,170,60,0.8)'; g.lineWidth = 2; g.beginPath(); g.arc(p.x, p.y, 21 + Math.sin(performance.now() / 60) * 2, 0, Math.PI * 2); g.stroke(); }
      g.strokeStyle = 'rgba(143,233,255,0.7)'; g.lineWidth = 2; g.beginPath();
      g.moveTo(p.x + Math.cos(p.aim) * 26, p.y + Math.sin(p.aim) * 26); g.lineTo(p.x + Math.cos(p.aim) * 34, p.y + Math.sin(p.aim) * 34); g.stroke();
    }

    for (let i = 0; i < this.particles.length; i++) {
      const pt = this.particles[i];
      if (!pt.active) continue;
      g.globalAlpha = Math.max(0, pt.life / pt.max); g.fillStyle = pt.color; g.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
    }
    g.globalAlpha = 1;
    g.font = 'bold 14px system-ui, sans-serif'; g.textAlign = 'center';
    for (let i = 0; i < this.texts.length; i++) {
      const t = this.texts[i];
      if (!t.active) continue;
      g.globalAlpha = Math.min(1, t.life * 2.5); g.fillStyle = '#000'; g.fillText(t.text, t.x + 1, t.y + 1); g.fillStyle = t.color; g.fillText(t.text, t.x, t.y);
    }
    g.globalAlpha = 1;
    g.restore();
    if (this.flash > 0) { // red hit vignette: one baked gradient, faded with globalAlpha (no per-frame allocation)
      if (!this._vignette) {
        const gr = g.createRadialGradient(this.W / 2, this.H / 2, Math.min(this.W, this.H) * 0.3, this.W / 2, this.H / 2, Math.max(this.W, this.H) * 0.7);
        gr.addColorStop(0, 'rgba(255,40,80,0)'); gr.addColorStop(1, 'rgba(255,40,80,0.55)');
        this._vignette = gr;
      }
      g.globalAlpha = this.flash; g.fillStyle = this._vignette; g.fillRect(0, 0, this.W, this.H); g.globalAlpha = 1;
    }
  }

  // ---------- HUD (plain DOM, only touched when a value changes) ----------

  _syncHud(force) {
    const hp = document.getElementById('realm-hp-fill');
    if (hp) hp.style.width = `${Math.max(0, this.player.hp) / this.stats.maxHp * 100}%`;
    const hpText = document.getElementById('realm-hp-text');
    if (hpText) hpText.textContent = `${Math.ceil(this.player.hp)} / ${this.stats.maxHp}`;
    const wave = document.getElementById('realm-wave');
    if (wave) wave.textContent = this.run.wave > 0 ? `Wave ${this.run.wave}` : 'Get ready';
    const shards = document.getElementById('realm-shards');
    if (shards) shards.textContent = `💎 ${Math.floor(this.displayShards)}`;
    const lv = document.getElementById('realm-level');
    if (lv) lv.textContent = `Lv ${this.save.level}`;
    const xpf = document.getElementById('realm-xp-fill');
    if (xpf) xpf.style.width = this.save.level >= RM_MAX_LEVEL ? '100%' : `${(this.save.xp / rmXpNeeded(this.save.level)) * 100}%`;
    const xpt = document.getElementById('realm-xp-text');
    if (xpt) xpt.textContent = this.save.level >= RM_MAX_LEVEL ? 'MAX' : `${this.save.xp} / ${rmXpNeeded(this.save.level)} xp`;
    this._syncAbilities();
    const best = document.getElementById('realm-best');
    if (best) best.textContent = this.save.bestWave > 0 ? `Best wave ${this.save.bestWave}` : '';
    if (force) this._hideBanner();
  }

  _syncAbilities() {
    for (let i = 0; i < 4; i++) {
      const el = document.getElementById(`realm-ab-${i}`);
      if (!el) continue;
      const ab = RM_ABILITIES[i]; const unlocked = this.abilityUnlocked(i); const cd = this.abilityCd[i];
      el.classList.toggle('locked', !unlocked);
      el.classList.toggle('cooling', unlocked && cd > 0);
      const cdEl = el.querySelector('.cd');
      if (cdEl) cdEl.textContent = !unlocked ? `Lv${ab.level}` : cd > 0 ? String(Math.ceil(cd)) : '';
      el.setAttribute('aria-label', `${ab.name} (${ab.key.toUpperCase()})${unlocked ? '' : ` — unlocks at level ${ab.level}`}`);
    }
  }

  _showBanner(text, seconds) {
    const el = document.getElementById('realm-banner');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('hidden');
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    clearTimeout(this._bannerTimer);
    if (seconds) this._bannerTimer = setTimeout(() => this._hideBanner(), seconds * 1000);
  }

  _hideBanner() {
    const el = document.getElementById('realm-banner');
    if (el) el.classList.add('hidden');
  }
}
