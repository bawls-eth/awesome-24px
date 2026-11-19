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
const RM_POOL = { pBullets: 160, eBullets: 420, enemies: 24, particles: 180, texts: 28 };
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

class RealmArena {
  constructor({ container, save, onSave, onExit, seed }) {
    this.container = container;
    this.onSave = onSave || (() => {});
    this.onExit = onExit || (() => {});
    const s = save && typeof save === 'object' ? save : {};
    this.save = { shards: rmCleanCount(s.shards), bestWave: rmCleanCount(s.bestWave), kills: rmCleanCount(s.kills), deaths: rmCleanCount(s.deaths) };
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
    this.player = { x: 0, y: 0, hp: RM_PLAYER.hp, iframes: 0, fireCd: 0, aim: 0, facing: 1, moving: false, bob: 0 };
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
      if (k === 'escape') { e.preventDefault(); this.leave(); return; }
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
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
    [this.pBullets, this.eBullets, this.enemies, this.particles, this.texts].forEach((pool) => pool.forEach((o) => { o.active = false; }));
    this.keys = {}; this.mouse.down = false; this.moveVec.x = 0; this.moveVec.y = 0; this.aimVec.on = false; this.aimVec.x = 0; this.aimVec.y = 0; // no stuck input from the last run
    const p = this.player;
    p.x = this.W / 2; p.y = this.H / 2; p.hp = RM_PLAYER.hp; p.iframes = 1; p.fireCd = 0; p.aim = -Math.PI / 2;
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
    this._updateEnemies(dt);
    this._updateBullets(dt);
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
    p.x = Math.max(RM_PLAYER.r, Math.min(this.W - RM_PLAYER.r, p.x + mx * RM_PLAYER.speed * dt));
    p.y = Math.max(RM_PLAYER.r, Math.min(this.H - RM_PLAYER.r, p.y + my * RM_PLAYER.speed * dt));
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
      p.fireCd = 1 / RM_PLAYER.fireRate;
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
          this._hitEnemy(e, RM_PLAYER.dmg);
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
    this._floatText(e.x + (this.rng() - 0.5) * 14, e.y - 14, String(dmg), '#fff');
    this._burst(e.x, e.y, RM_ENEMIES[e.type].color, 3, 110);
    if (e.hp > 0) return;
    e.active = false;
    const def = RM_ENEMIES[e.type];
    this.run.kills += 1; this.run.shards += def.shards;
    this.save.kills += 1; this.save.shards += def.shards;
    this._burst(e.x, e.y, def.color, 16, 230);
    this._floatText(e.x, e.y - 22, `+${def.shards} 💎`, '#8fe9ff');
    this.shake = Math.max(this.shake, 3);
    this.onSave(this.save);
  }

  _hitPlayer(dmg) {
    const p = this.player;
    p.hp = Math.max(0, p.hp - dmg);
    p.iframes = RM_PLAYER.iframes;
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
    if (hp) hp.style.width = `${Math.max(0, this.player.hp) / RM_PLAYER.hp * 100}%`;
    const hpText = document.getElementById('realm-hp-text');
    if (hpText) hpText.textContent = `${Math.ceil(this.player.hp)} / ${RM_PLAYER.hp}`;
    const wave = document.getElementById('realm-wave');
    if (wave) wave.textContent = this.run.wave > 0 ? `Wave ${this.run.wave}` : 'Get ready';
    const shards = document.getElementById('realm-shards');
    if (shards) shards.textContent = `💎 ${Math.floor(this.displayShards)}`;
    const best = document.getElementById('realm-best');
    if (best) best.textContent = this.save.bestWave > 0 ? `Best wave ${this.save.bestWave}` : '';
    if (force) this._hideBanner();
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
