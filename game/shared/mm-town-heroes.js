// MMTownHeroes: the Town's playable characters are our 10 Realm hero classes (original art in assets/arcane/b00..b03).
// Pure parts (node-tested in tests/shared-mm-town-heroes.test.js): the hero list, hero keys ('hero_<class>', frame 0, carried in
// the existing species field), the deterministic legacy species -> hero mapping (stable FNV-1a hash of "species:frame"), frame
// selection, the box-filter downscale and the stone tint. Browser parts: load the idle/walk strips, bake each hero ONCE into a small
// 24 px Phaser canvas texture (integer 7x box downscale of a 168 px crop around the feet anchor), alias textures under the old
// species keys so any leftover call site renders a mapped hero (never the old sheets), a cheap animator that only calls setFrame,
// and the join / outfit picker. Never rewrites stored values; unknown keys never throw. ?legacyart=1 brings the old sheets back.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.MMTownHeroes = factory(root);
}(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  var PREFIX = 'hero_';
  var DEFAULT_CLASS = 'ranger';
  var SIZE = 24;        // baked frame size (same as the old 24 px strips, so hitboxes/positions stay put)
  var FACTOR = 7;       // integer downscale: 168 px crop -> 24 px (the union of every idle/walk frame fits: x 48..208, y 72..232)
  var CELL = 256;       // strip cell size (all hero manifests)
  var ANCHOR_X = 128, ANCHOR_Y = 231; // feet anchor (all hero manifests)
  var CROP = SIZE * FACTOR;
  var CROP_X = ANCHOR_X - CROP / 2;   // 44
  var CROP_Y = ANCHOR_Y + 8 - CROP;   // 71: feet land on the bottom rows
  var HEROES = [
    { cls: 'warrior', name: 'Warrior', role: 'Sturdy front-line fighter', pack: 'b00-warrior', portrait: 'bruiser' },
    { cls: 'ranger', name: 'Ranger', role: 'Quick shots from afar', pack: 'b01-ranger-mage-cleric', portrait: 'ranger' },
    { cls: 'mage', name: 'Mage', role: 'Frosty spells that slow foes', pack: 'b01-ranger-mage-cleric', portrait: 'frostcaller' },
    { cls: 'cleric', name: 'Cleric', role: 'Heals and shields friends', pack: 'b01-ranger-mage-cleric', portrait: 'herald' },
    { cls: 'rogue', name: 'Rogue', role: 'Fast blades, slips away', pack: 'b02-rogue-warlock-paladin', portrait: 'rogue' },
    { cls: 'warlock', name: 'Warlock', role: 'Dark bolts that drain foes', pack: 'b02-rogue-warlock-paladin', portrait: 'warlock' },
    { cls: 'paladin', name: 'Paladin', role: 'Holy shield, steady hits', pack: 'b02-rogue-warlock-paladin', portrait: 'paladin' },
    { cls: 'berserker', name: 'Berserker', role: 'Wild rage, big swings', pack: 'b03-berserker-druid-necromancer', portrait: 'berserker' },
    { cls: 'druid', name: 'Druid', role: 'Nature magic and vines', pack: 'b03-berserker-druid-necromancer', portrait: 'druid' },
    { cls: 'necromancer', name: 'Necromancer', role: 'Raises bony helpers', pack: 'b03-berserker-druid-necromancer', portrait: 'necromancer' }
  ];
  var CLASSES = HEROES.map(function (h) { return h.cls; });
  var ACTIONS = { idle: { frames: 4, fps: 6 }, walk: { frames: 6, fps: 10 } };
  var DIRS = ['down', 'up', 'right'];
  // Legacy sheets the Town used to load; alias textures with these keys are baked from hero frames (statues for the decor ones).
  var STATUE_KEYS = ['punkrocks', 'mooncats'];
  var ALIAS_FRAMES = 16;

  function heroOf(cls) { for (var i = 0; i < HEROES.length; i++) if (HEROES[i].cls === cls) return HEROES[i]; return null; }
  function heroKey(cls) { return PREFIX + (heroOf(cls) ? cls : DEFAULT_CLASS); }
  function classOfKey(key) {
    if (typeof key !== 'string' || key.indexOf(PREFIX) !== 0) return null;
    var c = key.slice(PREFIX.length);
    return heroOf(c) ? c : null;
  }
  function isHeroKey(key) { return classOfKey(key) !== null; }
  function hash(str) {
    var h = 0x811c9dc5;
    str = String(str);
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }
  // Any stored species/frame -> one of the 10 classes. Hero keys map to themselves; everything else (legacy or junk) by hash.
  function classFor(species, frame) {
    var c = classOfKey(species);
    if (c) return c;
    var f = Number.isInteger(frame) ? frame : 0;
    var s = typeof species === 'string' ? species : '';
    return CLASSES[hash(s + ':' + f) % CLASSES.length];
  }
  // Texture to draw for a stored species/frame. legacyOk(key) -> true means the old sheet is loaded (?legacyart=1): keep it.
  function resolve(species, frame, legacyOk) {
    if (!isHeroKey(species) && typeof legacyOk === 'function' && typeof species === 'string' && legacyOk(species)) {
      return { key: species, frame: Number.isInteger(frame) ? frame : 0, legacy: true };
    }
    return { key: PREFIX + classFor(species, frame), frame: 0, legacy: false };
  }
  // The picker's starting key: a hero key stays; a legacy key is KEPT (so joining never rewrites it) but highlights its mapped hero.
  function pickStart(species, frame) {
    if (isHeroKey(species)) return { key: species, frame: 0, cls: classOfKey(species) };
    if (typeof species === 'string' && species) return { key: species, frame: Number.isInteger(frame) ? frame : 0, cls: classFor(species, frame) };
    return { key: PREFIX + DEFAULT_CLASS, frame: 0, cls: DEFAULT_CLASS };
  }
  function legacyArt(search) {
    try { return /[?&]legacyart=1(&|$)/.test(String(search == null ? (root.location && root.location.search) || '' : search)); } catch (e) { return false; }
  }
  function stripUrl(cls, action, dir) {
    var h = heroOf(cls); if (!h) return null;
    return 'assets/arcane/' + h.pack + '/characters/' + cls + '/' + cls + '_' + action + '_' + dir + '.png';
  }
  function portraitUrl(cls) {
    var h = heroOf(cls); if (!h) return null;
    return 'assets/arcane/b20-class-portraits-and-ability-icons/portraits/portrait_' + h.portrait + '.png';
  }
  // Frame layout of a baked hero texture: index 0 = idle_down_0, then every action/dir/frame. Names like 'walk_right_3'.
  function frameLayout() {
    var out = [];
    Object.keys(ACTIONS).forEach(function (a) {
      DIRS.forEach(function (d) { for (var i = 0; i < ACTIONS[a].frames; i++) out.push({ name: a + '_' + d + '_' + i, action: a, dir: d, i: i }); });
    });
    return out;
  }
  // Smoothed velocity (px/s) -> facing; left is drawn as right (the Town code flips the sprite).
  function dirFor(vx, vy, prev) {
    var ax = Math.abs(vx), ay = Math.abs(vy);
    if (ax < 1e-6 && ay < 1e-6) return prev || 'down';
    if (ax >= ay * 0.8) return 'right';
    return vy < 0 ? 'up' : 'down';
  }
  function frameName(dir, moving, tMs, phase) {
    var a = moving ? 'walk' : 'idle';
    var spec = ACTIONS[a];
    var d = DIRS.indexOf(dir) >= 0 ? dir : 'down';
    var t = Math.max(0, Number(tMs) || 0) + (Number(phase) || 0);
    var i = Math.floor(t * spec.fps / 1000) % spec.frames;
    return a + '_' + d + '_' + i;
  }
  // Box filter: one SIZE x SIZE frame from an RGBA buffer (width srcW), crop origin (sx, sy), FACTOR x FACTOR blocks.
  // Coverage >= 3/8 -> opaque pixel with the alpha-weighted mean colour; else transparent (crisp pixel-art edges).
  function downsample(data, srcW, srcH, sx, sy, size, factor) {
    size = size || SIZE; factor = factor || FACTOR;
    var out = new Uint8ClampedArray(size * size * 4);
    var n = factor * factor;
    for (var oy = 0; oy < size; oy++) {
      for (var ox = 0; ox < size; ox++) {
        var r = 0, g = 0, b = 0, a = 0;
        for (var y = 0; y < factor; y++) {
          var py = sy + oy * factor + y;
          if (py < 0 || py >= srcH) continue;
          for (var x = 0; x < factor; x++) {
            var px = sx + ox * factor + x;
            if (px < 0 || px >= srcW) continue;
            var k = (py * srcW + px) * 4, al = data[k + 3];
            r += data[k] * al; g += data[k + 1] * al; b += data[k + 2] * al; a += al;
          }
        }
        var o = (oy * size + ox) * 4;
        if (a >= n * 255 * 0.375) { out[o] = r / a; out[o + 1] = g / a; out[o + 2] = b / a; out[o + 3] = 255; }
      }
    }
    return out;
  }
  // Stone statue look: luminance onto a warm grey ramp, alpha kept.
  function stoneTint(px) {
    for (var k = 0; k < px.length; k += 4) {
      if (!px[k + 3]) continue;
      var l = 0.3 * px[k] + 0.59 * px[k + 1] + 0.11 * px[k + 2];
      var c = 72 + l * 0.62;
      px[k] = c + 6; px[k + 1] = c + 2; px[k + 2] = c - 4;
    }
    return px;
  }

  // ---------- browser ----------
  var srcKey = function (cls, a, d) { return 'htsrc_' + cls + '_' + a + '_' + d; };
  function preload(scene) {
    HEROES.forEach(function (h) {
      Object.keys(ACTIONS).forEach(function (a) {
        DIRS.forEach(function (d) { scene.load.image(srcKey(h.cls, a, d), stripUrl(h.cls, a, d)); });
      });
    });
  }
  var baked = Object.create(null); // cls -> canvas (row of SIZE frames, layout order)
  function bakeClass(scene, cls) {
    if (baked[cls]) return baked[cls];
    var layout = frameLayout();
    var canvas = document.createElement('canvas');
    canvas.width = SIZE * layout.length; canvas.height = SIZE;
    var ctx = canvas.getContext('2d');
    var scratch = document.createElement('canvas');
    var sctx = scratch.getContext('2d', { willReadFrequently: true });
    var outImg = ctx.createImageData(SIZE, SIZE);
    var cache = Object.create(null);
    layout.forEach(function (f, idx) {
      var key = srcKey(cls, f.action, f.dir);
      if (!cache[key]) {
        cache[key] = null;
        if (scene.textures.exists(key)) {
          var img = scene.textures.get(key).getSourceImage();
          if (img && img.width) {
            scratch.width = img.width; scratch.height = img.height;
            sctx.clearRect(0, 0, img.width, img.height);
            sctx.drawImage(img, 0, 0);
            cache[key] = { data: sctx.getImageData(0, 0, img.width, img.height).data, w: img.width, h: img.height };
          }
        }
      }
      var src = cache[key];
      if (!src) return; // missing strip: leave the cell empty, never throw
      var cells = Math.max(1, Math.floor(src.w / CELL));
      var cx = (f.i % cells) * CELL;
      outImg.data.set(downsample(src.data, src.w, src.h, cx + CROP_X, CROP_Y, SIZE, FACTOR));
      ctx.putImageData(outImg, idx * SIZE, 0);
    });
    // Free the full-size source strips: the baked 24 px row is all the Town draws.
    Object.keys(cache).forEach(function (k) { if (scene.textures.exists(k)) scene.textures.remove(k); });
    baked[cls] = canvas;
    return canvas;
  }
  function addCanvasTexture(scene, key, canvas, names) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    var tex = scene.textures.addCanvas(key, canvas);
    names.forEach(function (name, idx) { tex.add(name, 0, idx * SIZE, 0, SIZE, SIZE); });
    return tex;
  }
  // Bake every hero once; then (unless ?legacyart=1) alias textures under the old species keys.
  function bake(scene, legacyKeys) {
    var layout = frameLayout();
    HEROES.forEach(function (h) {
      var key = PREFIX + h.cls;
      if (scene.textures.exists(key)) return;
      var c = bakeClass(scene, h.cls);
      var names = layout.map(function (f) { return f.name; });
      var tex = addCanvasTexture(scene, key, c, names);
      tex.add(0, 0, 0, 0, SIZE, SIZE);
    });
    if (legacyArt()) return;
    (legacyKeys || []).concat(STATUE_KEYS).forEach(function (k) {
      if (typeof k !== 'string' || scene.textures.exists(k)) return;
      var statue = STATUE_KEYS.indexOf(k) >= 0;
      var canvas = document.createElement('canvas');
      canvas.width = SIZE * ALIAS_FRAMES; canvas.height = SIZE;
      var ctx = canvas.getContext('2d');
      var names = [];
      for (var i = 0; i < ALIAS_FRAMES; i++) {
        var src = baked[classFor(k, i)];
        if (src) ctx.drawImage(src, 0, 0, SIZE, SIZE, i * SIZE, 0, SIZE, SIZE);
        names.push(i);
      }
      if (statue) {
        var id = ctx.getImageData(0, 0, canvas.width, SIZE);
        stoneTint(id.data);
        ctx.putImageData(id, 0, 0);
      }
      addCanvasTexture(scene, k, canvas, names);
    });
  }
  // Animator: every frame, hero sprites get an idle/walk frame from their own smoothed on-screen motion. Only setFrame, no redraws;
  // the sprite list is refreshed every 30 frames. Sprites can opt out with sprite.htStill = true.
  function animate(scene) {
    var list = [], tick = 0;
    var Ev = root.Phaser && root.Phaser.Scenes && root.Phaser.Scenes.Events;
    var evName = Ev && Ev.POST_UPDATE ? Ev.POST_UPDATE : 'postupdate';
    scene.events.on(evName, function (time, delta) {
      if (tick++ % 30 === 0) {
        list = scene.children.list.filter(function (o) { return o && o.texture && o.setFrame && isHeroKey(o.texture.key); });
      }
      for (var i = 0; i < list.length; i++) {
        var s = list[i];
        if (!s.active || !s.visible || s.htStill || !isHeroKey(s.texture.key)) continue;
        // Players: the Town's walk-cycle hands over its moving flag and the hop-free anchor (htMoving/htAx/htAy); others: own motion.
        var x = typeof s.htAx === 'number' ? s.htAx : s.x, y = typeof s.htAy === 'number' ? s.htAy : s.y;
        var st = s.htState;
        if (!st) st = s.htState = { x: x, y: y, vx: 0, vy: 0, dir: 'down', until: 0, phase: hash(Math.round(x) + ',' + Math.round(y)) % 1000 };
        st.vx = st.vx * 0.6 + (x - st.x) * 0.4;
        st.vy = st.vy * 0.6 + (y - st.y) * 0.4;
        st.x = x; st.y = y;
        var fast = st.vx * st.vx + st.vy * st.vy > 0.25 * 0.25;
        if (fast) st.until = time + 150;
        var moving = typeof s.htMoving === 'boolean' ? s.htMoving : time < st.until;
        if (fast || (moving && Math.abs(st.vx) + Math.abs(st.vy) > 0.01)) st.dir = dirFor(st.vx, st.vy, st.dir);
        var name = frameName(st.dir, moving, time, st.phase);
        if (s.frame && s.frame.name !== name && s.texture.has(name)) s.setFrame(name, false, false);
      }
    });
  }
  // Realm / cave avatar: a data URL of the baked 24 px idle frame (frame 0), or null (caller keeps its old path).
  function avatarArgs(species, frame) {
    try {
      var c = baked[classFor(species, frame)];
      if (!c) return null;
      var one = document.createElement('canvas'); one.width = SIZE; one.height = SIZE;
      one.getContext('2d').drawImage(c, 0, 0, SIZE, SIZE, 0, 0, SIZE, SIZE);
      return { url: one.toDataURL('image/png'), frame: 0 };
    } catch (e) { return null; }
  }
  // Join screen / outfit shop picker: one "Heroes" tab, 10 portrait buttons (48 px), a caption with name + role (textContent only).
  function renderPicker(tabsEl, gridEl, currentKey, currentFrame, onPick) {
    if (!tabsEl || !gridEl) return;
    var cur = pickStart(currentKey, currentFrame).cls;
    tabsEl.innerHTML = '';
    var tab = document.createElement('button');
    tab.type = 'button'; tab.className = 'species-tab active'; tab.textContent = 'Heroes';
    tabsEl.appendChild(tab);
    gridEl.innerHTML = '';
    HEROES.forEach(function (h) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'avatar-choice hero-choice' + (h.cls === cur ? ' selected' : '');
      btn.dataset.hero = h.cls;
      btn.title = h.name + ': ' + h.role;
      btn.setAttribute('aria-label', h.name + ': ' + h.role);
      btn.style.backgroundImage = 'url(' + portraitUrl(h.cls) + ')';
      btn.style.backgroundSize = '100% 100%';
      btn.style.backgroundPosition = '0 0';
      btn.addEventListener('click', function () { onPick(PREFIX + h.cls, 0); });
      gridEl.appendChild(btn);
    });
    var capId = gridEl.id + '-hero-caption';
    var cap = document.getElementById(capId);
    if (!cap) {
      cap = document.createElement('p');
      cap.id = capId; cap.className = 'hero-pick-caption';
      cap.style.margin = '6px 0 0'; cap.style.fontSize = '12px'; cap.style.textAlign = 'center';
      gridEl.parentNode.insertBefore(cap, gridEl.nextSibling);
    }
    var h = heroOf(cur);
    cap.textContent = h ? h.name + ' - ' + h.role : '';
  }

  return {
    PREFIX: PREFIX, DEFAULT_CLASS: DEFAULT_CLASS, SIZE: SIZE, FACTOR: FACTOR, CROP_X: CROP_X, CROP_Y: CROP_Y,
    HEROES: HEROES, CLASSES: CLASSES, ACTIONS: ACTIONS, DIRS: DIRS, STATUE_KEYS: STATUE_KEYS,
    heroOf: heroOf, heroKey: heroKey, classOfKey: classOfKey, isHeroKey: isHeroKey, hash: hash, classFor: classFor,
    resolve: resolve, pickStart: pickStart, legacyArt: legacyArt, stripUrl: stripUrl, portraitUrl: portraitUrl,
    frameLayout: frameLayout, dirFor: dirFor, frameName: frameName, downsample: downsample, stoneTint: stoneTint,
    preload: preload, bake: bake, animate: animate, avatarArgs: avatarArgs, renderPicker: renderPicker
  };
}));
