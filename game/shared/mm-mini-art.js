// MMMiniArt: one loader for the minigame sprite sets m01-m08 (CODEX-MINIGAME-ART-ASKS.md; R14-R25 in CODEX-REMAKE-QUEUE.md keep these ids).
// Every id has a procedural 8-bit fallback (16-colour MM8 palette, navy rim, top-left light, alpha 0/255), so a game can draw by id today
// and real Codex art replaces the code look as soon as its batch is registered in assets/arcane/INDEX.json (folder `mNN-<label>`).
// Pure parts (node-testable): BATCHES, ids(batch), spec(id), pixels(id, frame), batchFor(id), pickFolders(index).
// Browser parts: load(batches?, opts?) -> Promise<MiniSet> (never rejects); MiniSet.has / source / frameAt / draw / canvas.
// Sizes follow the asks: strips are 4x cells (S32 -> 128) and draw at native size (cell / 4) x scale; icons / tiles / backdrops are 1x.
// No storage, no network writes, no random calls and no clock reads (all shapes are hashed from the id). Browser: window.MMMiniArt. Node: require().
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMMiniArt = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // MM8.PAL (PICO-8-like): 0 black 1 navy 2 plum 3 green 4 brown 5 grey 6 silver 7 white 8 red 9 orange 10 yellow 11 lime 12 blue 13 lilac 14 pink 15 peach
  var PAL = ['#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8',
    '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa'];
  var RIM = '#1b2140'; // the navy outline the tundra / reef / minigame sets use
  // ramps dark -> base -> light (palette indices)
  var RAMPS = {
    gold: [9, 10, 7], silver: [5, 6, 7], bronze: [4, 9, 15], grey: [1, 5, 6], red: [2, 8, 14], green: [3, 11, 7], blue: [1, 12, 6],
    lilac: [2, 13, 6], pink: [2, 14, 15], brown: [5, 4, 15], peach: [4, 15, 7], orange: [4, 9, 10], navy: [0, 1, 13], white: [6, 7, 7]
  };
  var RAMP_KEYS = ['red', 'green', 'blue', 'lilac', 'pink', 'orange', 'gold', 'brown', 'silver', 'peach'];

  function S(n) { return { kind: 'sprite', w: n, h: n, up: 4 }; }
  function I(w, h) { return { kind: 'icon', w: w, h: h || w, up: 1 }; }
  function T(w, h) { return { kind: 'tile', w: w, h: h || w, up: 1 }; }
  function B(w, h) { return { kind: 'backdrop', w: w, h: h, up: 1 }; }
  function anim(o, frames, fps, loop) { o.frames = frames; o.fps = fps; o.loop = !!loop; return o; }

  var FISH = { minnow: 32, perch: 32, sunfish: 32, bluegill: 32, smelt: 32, goby: 32, tetra: 32, guppy: 32, trout: 48, bass: 48, carp: 48,
    catfish: 48, pike: 48, char: 48, mackerel: 48, sea_bream: 48, salmon: 64, sturgeon: 64, eel: 64, koi: 64, ice_cod: 64, lanternfish: 48,
    mangrove_snapper: 48, moonfish: 64 };
  var ARENAS = ['meadow', 'orchard', 'pond_edge', 'forest', 'dunes', 'cliffs', 'marsh', 'lantern_glade', 'night_glade'];
  var SPOTS = ['west_pond', 'east_pond', 'river_run', 'sea_pier', 'ice_hole', 'mangrove', 'isles_cove'];

  // id -> spec table, by batch. Bugs come from the game's own species table (spec() also understands any bug_<id>_* id).
  var BATCHES = {
    m01: { label: 'jam-stage', table: function (t) {
      t.jam_stage_bg = B(390, 220); t.jam_campfire = anim(S(32), 6, 8, true);
      ['lute', 'drum', 'flute', 'bell'].forEach(function (k) { t['jam_inst_' + k] = I(32); });
      [1, 2, 3, 4].forEach(function (n) { t['jam_lane_note_' + n] = I(24); t['jam_lane_hold_' + n] = T(24, 8); });
      ['perfect', 'good', 'miss'].forEach(function (k) { t['jam_hit_' + k] = I(32, 16); });
      t.jam_fx_note_burst = anim(S(32), 5, 12, false);
      ['fox', 'frog', 'owl', 'bunny'].forEach(function (k) { t['jam_crowd_' + k + '_cheer'] = anim(S(32), 4, 6, true); t['jam_crowd_' + k + '_idle'] = anim(S(32), 4, 6, true); });
    } },
    m02: { label: 'angler-fish', table: function (t) {
      Object.keys(FISH).forEach(function (k) {
        t['fish_' + k + '_swim_right'] = anim(S(FISH[k]), 4, 8, true); t['fish_' + k + '_flop_right'] = anim(S(FISH[k]), 3, 10, true); t['fish_' + k + '_icon'] = I(32);
      });
      t.fish_lanternfish_glow = anim(S(48), 4, 8, true);
    } },
    m03: { label: 'bug-safari', table: function (t) {
      t.ui_bug_net = I(32); t.ui_bug_net_swing = anim(S(32), 4, 12, false); t.ui_bug_jar_empty = I(32); t.ui_bug_jar_full = I(32);
      ARENAS.forEach(function (a) { t['bug_arena_' + a] = B(96, 64); });
    } },
    m04: { label: 'stalk-market', table: function (t) {
      t.stalk_turnip = I(32); t.stalk_turnip_spoiled = I(32); [1, 10, 100].forEach(function (n) { t['stalk_turnip_bundle_' + n] = I(32); });
      t.stalk_stall = I(160, 96); t.stalk_seller_idle = anim(S(48), 4, 6, true);
      ['rising', 'falling', 'spike', 'flat', 'unknown'].forEach(function (k) { t['stalk_mood_' + k] = I(16); });
      t.stalk_bell_coin = I(16);
    } },
    m05: { label: 'deepdelve-ores', table: function (t) {
      ['dirt', 'stone', 'deepstone', 'gravel', 'sand', 'ice', 'crystal_wall', 'lava_rock', 'wood', 'leaves'].forEach(function (k) { t['dd_tile_' + k] = T(16); });
      [1, 2, 3, 4].forEach(function (n) { t['dd_crack_' + n] = I(16); });
      ['copper', 'iron', 'silver', 'gold', 'azurite', 'ruby', 'emerald', 'glowshard'].forEach(function (k) { t['dd_ore_' + k] = T(16); t['dd_item_' + k] = I(16); });
      ['cave_slug', 'rock_mite', 'glow_bat'].forEach(function (m) {
        ['down', 'up', 'right'].forEach(function (d) {
          t['dd_mob_' + m + '_idle_' + d] = anim(S(48), 4, 6, true); t['dd_mob_' + m + '_move_' + d] = anim(S(48), 6, 10, true);
          t['dd_mob_' + m + '_attack_' + d] = anim(S(48), 5, 12, false); t['dd_mob_' + m + '_death_' + d] = anim(S(48), 5, 8, false);
        });
      });
      ['wood', 'stone', 'copper', 'iron', 'gold', 'crystal'].forEach(function (k) { t['dd_pick_' + k] = I(32); });
      t.dd_torch = I(16);
    } },
    m06: { label: 'angler-spots', table: function (t) {
      SPOTS.forEach(function (s) { t['angler_spot_' + s + '_day'] = B(390, 260); t['angler_spot_' + s + '_night'] = B(390, 260); });
      t.angler_bobber = I(8, 12); t.angler_splash = anim(S(32), 5, 12, false); t.angler_dock = I(96, 24);
      t.angler_hero_cast = anim(S(48), 6, 10, false); t.angler_hero_reel = anim(S(48), 4, 10, true); t.angler_hero_idle = anim(S(48), 4, 6, true);
    } },
    m07: { label: 'pop-dash', table: function (t) {
      for (var n = 1; n <= 11; n++) t['pop_tile_' + n] = I(32);
      t.pop_fx_pop = anim(S(32), 5, 14, false); t.pop_fx_chain = anim(S(32), 6, 12, false); t.pop_board_frame = I(48); t.pop_bg_tile = T(32);
      t.dash_runner_run_right = anim(S(32), 6, 12, true); t.dash_runner_jump_right = anim(S(32), 3, 10, false); t.dash_runner_fall_right = anim(S(32), 3, 10, false);
      t.dash_lantern_glow = anim(S(32), 4, 8, true); t.dash_rock_small = I(24); t.dash_rock_big = I(32); t.dash_firefly = anim(S(32), 4, 8, true);
      t.dash_ground = T(32); t.dash_gap_edge_l = I(16, 32); t.dash_gap_edge_r = I(16, 32); t.dash_bg_far = B(390, 200); t.dash_bg_near = B(390, 200);
      t.dash_flag_best = I(16, 24);
    } },
    m08: { label: 'minigame-ui', table: function (t) {
      ['bronze', 'silver', 'gold', 'star', 'locked'].forEach(function (k) { t['medal_' + k] = I(32); });
      ['angler', 'jam', 'bugs', 'stalk', 'deepdelve', 'pop', 'dash', 'isles'].forEach(function (k) { t['trophy_' + k] = I(32); });
      t.ui_star_full = I(16); t.ui_star_empty = I(16); t.ui_new_best = I(48, 16); t.ui_result_panel = I(48); t.ui_confetti = anim(S(32), 6, 12, false);
    } }
  };
  var TABLE = Object.create(null), OWNER = Object.create(null);
  Object.keys(BATCHES).forEach(function (b) {
    var t = {}; BATCHES[b].table(t);
    BATCHES[b].ids = Object.keys(t);
    Object.keys(t).forEach(function (id) {
      var s = t[id]; s.id = id; s.batch = b; if (!s.frames) { s.frames = 1; s.fps = 0; s.loop = false; } TABLE[id] = s; OWNER[id] = b;
    });
  });

  function ids(batch) { return batch && BATCHES[batch] ? BATCHES[batch].ids.slice() : Object.keys(TABLE); }
  var ID_RE = /^[a-z0-9_]{1,64}$/;
  // spec(id) -> { id, batch, kind, w, h (native), up (4 for strips, 1 for 1x), frames, fps, loop } or null. Unknown bug_<x>_{idle,move,icon} ids resolve too.
  function spec(id) {
    if (typeof id !== 'string' || !ID_RE.test(id)) return null;
    if (TABLE[id]) return TABLE[id];
    var m = /^bug_([a-z0-9_]+)_(idle|move|icon)$/.exec(id);
    if (m && !/^arena_/.test(m[1])) {
      var s = m[2] === 'icon' ? I(32) : anim(S(32), m[2] === 'idle' ? 2 : 4, m[2] === 'idle' ? 4 : 10, true);
      if (!s.frames) { s.frames = 1; s.fps = 0; s.loop = false; }
      s.id = id; s.batch = 'm03'; return s;
    }
    return null;
  }
  function batchFor(id) { var s = spec(id); return s ? s.batch : null; }

  // ---- procedural fallback: a mask per family, shaded with a 3-step ramp (top-left light) and a navy rim ----
  function hash(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rgb(hex) { var n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function rampFor(id) {
    var m;
    if (/^medal_gold|^trophy_|^ui_star_full|^dd_ore_gold|^dd_item_gold|^stalk_bell|^ui_new_best|^dd_pick_gold/.test(id)) return RAMPS.gold;
    if (/^medal_silver|^dd_(ore|item|pick)_(silver|iron)|^dd_tile_stone|^dd_tile_gravel|rock/.test(id)) return RAMPS.silver;
    if (/^medal_bronze|^dd_(ore|item|pick)_copper/.test(id)) return RAMPS.bronze;
    if (/^medal_star/.test(id)) return RAMPS.pink;
    if (/locked|_empty$|spoiled|^dd_crack/.test(id)) return RAMPS.grey;
    if (/stalk_turnip/.test(id)) return RAMPS.lilac;
    if ((m = /^pop_tile_(\d+)$/.exec(id))) return RAMPS[RAMP_KEYS[(Number(m[1]) - 1) % RAMP_KEYS.length]];
    if (/ruby|lava|_red|miss|falling/.test(id)) return RAMPS.red;
    if (/emerald|leaves|green|good|rising|^fish_(char|pike|bass)/.test(id)) return RAMPS.green;
    if (/azurite|ice|water|blue|^dd_tile_crystal|perfect/.test(id)) return RAMPS.blue;
    if (/dirt|wood|log|dock|stall|^dd_tile_sand|ground|gap_edge/.test(id)) return RAMPS.brown;
    if (/glow|lantern|firefly|campfire|torch|spike|confetti|fx_/.test(id)) return RAMPS.orange;
    return RAMPS[RAMP_KEYS[hash(id) % RAMP_KEYS.length]];
  }
  function inEllipse(x, y, cx, cy, rx, ry) { var dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry; return dx * dx + dy * dy <= 1; }
  function inPoly(x, y, pts) { // even-odd point in polygon, pixel centre
    var px = x + 0.5, py = y + 0.5, c = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var a = pts[i], b = pts[j];
      if ((a[1] > py) !== (b[1] > py) && px < (b[0] - a[0]) * (py - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }
  function star(cx, cy, r) { var p = []; for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; p.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); } return p; }
  // mask(x, y) for an id at native w x h, frame f (small per-frame bob / wiggle so strips animate)
  function maskFor(s, f) {
    var id = s.id, w = s.w, h = s.h, cx = w / 2, cy = h / 2, bob = s.frames > 1 ? (f % 2) : 0, m;
    if (/^medal_/.test(id)) return function (x, y) { return inEllipse(x, y, cx, h * 0.62, w * 0.36, h * 0.34) || (y < h * 0.3 && y >= 1 && Math.abs(x + 0.5 - cx) < w * 0.12 + (h * 0.3 - y) * 0.25); };
    if (/^trophy_/.test(id)) return function (x, y) { var u = y / h; return (u > 0.12 && u < 0.55 && inEllipse(x, y, cx, h * 0.2, w * 0.36, h * 0.38)) || (u >= 0.55 && u < 0.78 && Math.abs(x + 0.5 - cx) < w * 0.08) || (u >= 0.78 && u < 0.92 && Math.abs(x + 0.5 - cx) < w * 0.28); };
    if (/^ui_star_|^medal_star|_spike$|^dd_ore_glowshard/.test(id)) { var sp = star(cx, cy + 0.5, Math.min(w, h) * 0.46); return function (x, y) { return inPoly(x, y, sp); }; }
    if ((m = /^jam_lane_note_(\d)$/.exec(id))) {
      var k = Number(m[1]), r = w * 0.4;
      if (k === 1) return function (x, y) { return inEllipse(x, y, cx, cy, r, r); };
      if (k === 2) return function (x, y) { return Math.abs(x + 0.5 - cx) + Math.abs(y + 0.5 - cy) <= r * 1.15; };
      if (k === 3) return function (x, y) { return inPoly(x, y, [[cx, cy - r], [cx + r, cy + r * 0.8], [cx - r, cy + r * 0.8]]); };
      return function (x, y) { return Math.abs(x + 0.5 - cx) <= r * 0.85 && Math.abs(y + 0.5 - cy) <= r * 0.85; };
    }
    if (/^stalk_mood_rising$/.test(id)) return function (x, y) { return inPoly(x, y, [[cx, 1], [w - 2, cy], [cx + 2, cy], [cx + 2, h - 2], [cx - 2, h - 2], [cx - 2, cy], [1, cy]]); };
    if (/^stalk_mood_falling$/.test(id)) return function (x, y) { return inPoly(x, y, [[cx, h - 1], [w - 2, cy], [cx + 2, cy], [cx + 2, 2], [cx - 2, 2], [cx - 2, cy], [1, cy]]); };
    if (/^stalk_mood_flat$/.test(id)) return function (x, y) { return Math.abs(y + 0.5 - cy) <= 2 && x >= 2 && x < w - 2; };
    if (/^fish_/.test(id) && s.kind === 'sprite') { // side view, facing right, body centre anchor; eel is long and thin
      var eel = /^fish_eel_/.test(id), bw = (eel ? 0.46 : 0.34) * w, bh = (eel ? 0.1 : 0.17) * h, tail = cx - bw - (eel ? 0 : w * 0.1), wig = (f % 2 ? 1 : -1) * (s.frames > 1 ? 1 : 0);
      return function (x, y) {
        return inEllipse(x, y, cx + w * 0.05, cy, bw, bh) || (!eel && inPoly(x, y, [[cx - bw * 0.8 + w * 0.05, cy], [tail, cy - bh + wig], [tail, cy + bh + wig]])) || (y < cy - bh * 0.6 && y > cy - bh * 1.35 && Math.abs(x + 0.5 - cx) < bw * 0.25);
      };
    }
    if (/^bug_/.test(id) && s.kind === 'sprite') { var spread = s.frames > 2 ? (f % 2) * 2 : 0; return function (x, y) { return inEllipse(x, y, cx, cy + 1, w * 0.14, h * 0.26) || inEllipse(x, y, cx - w * 0.16 - spread, cy - 1, w * 0.13, h * 0.14) || inEllipse(x, y, cx + w * 0.16 + spread, cy - 1, w * 0.13, h * 0.14) || inEllipse(x, y, cx, cy - h * 0.25, w * 0.08, h * 0.07); }; }
    if (s.kind === 'sprite') { // generic critter / effect: a rounded body with a bob
      if (/fx_|splash|confetti|burst|glow|firefly/.test(id)) { var rr = Math.min(w, h) * (0.15 + 0.06 * (f % 4)); return function (x, y) { return inEllipse(x, y, cx, cy, rr, rr) && !inEllipse(x, y, cx, cy, rr * 0.5, rr * 0.5); }; }
      return function (x, y) { return inEllipse(x, y, cx, h * 0.6 - bob, w * 0.3, h * 0.3) || inEllipse(x, y, cx, h * 0.3 - bob, w * 0.2, h * 0.18); };
    }
    if (s.kind === 'tile' || s.kind === 'backdrop') return function () { return true; };
    return function (x, y) { // icon: rounded square inset 1 px
      var ix = Math.min(x, w - 1 - x), iy = Math.min(y, h - 1 - y), c = Math.max(1, Math.round(Math.min(w, h) / 8));
      return ix >= 1 && iy >= 1 && !(ix + iy < c + 2 && ix < c + 1 && iy < c + 1);
    };
  }
  // pixels(id, frame?) -> { w, h, data: Uint8ClampedArray RGBA } at NATIVE size (strip ids: one cell / 4). Deterministic; null for unknown ids.
  function pixels(id, frame) {
    var s = spec(id); if (!s) return null;
    var w = s.w, h = s.h, f = Math.max(0, Math.floor(Number(frame) || 0)) % s.frames, data = new Uint8ClampedArray(w * h * 4);
    var mask = maskFor(s, f), ramp = rampFor(id).map(function (i) { return rgb(PAL[i]); }), rim = rgb(RIM), seed = hash(id);
    var inside = new Uint8Array(w * h), x, y;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) inside[y * w + x] = mask(x, y) ? 1 : 0;
    var opaque = s.kind === 'tile' || s.kind === 'backdrop';
    function set(x, y, c) { var q = (y * w + x) * 4; data[q] = c[0]; data[q + 1] = c[1]; data[q + 2] = c[2]; data[q + 3] = 255; }
    function at(x, y) { return x >= 0 && y >= 0 && x < w && y < h && inside[y * w + x] === 1; }
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      if (!inside[y * w + x]) continue;
      var c;
      if (opaque) { // dithered 3-tone texture, darker toward the bottom (backdrops: sky over ground)
        var n = hash(id + ':' + ((x >> 1) + (y >> 1) * 97)) & 7, u = y / h;
        c = ramp[n === 0 ? 2 : (n < 3 || u > 0.6 ? 0 : 1)];
      } else if (!at(x - 1, y) || !at(x, y - 1)) c = ramp[2]; // top-left light edge
      else if (!at(x + 1, y) || !at(x, y + 1) || !at(x + 1, y + 1)) c = ramp[0]; // bottom-right shade
      else c = (at(x - 2, y) && at(x, y - 2) && (!at(x - 3, y) || !at(x, y - 3)) && ((x + y + (seed & 1)) & 1)) ? ramp[2] : ramp[1]; // dithered second highlight row
      set(x, y, c);
    }
    if (!opaque) for (y = 0; y < h; y++) for (x = 0; x < w; x++) { // navy rim around the shape (4-neighbour)
      if (inside[y * w + x]) continue;
      if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) set(x, y, rim);
    }
    if (/^fish_/.test(id) && s.kind === 'sprite') { var ex = Math.round(w * 0.68), ey = Math.round(h / 2 - h * 0.05); if (ex < w && ey >= 0) { set(ex, ey, rim); if (ey > 0) set(ex, ey - 1, rgb(PAL[7])); } } // one eye + catchlight
    return { w: w, h: h, data: data };
  }

  // ---- INDEX.json folders: mNN-<label> (or an explicit opts.folders map) ----
  var FOLDER_RE = /^(m0[1-8])-[a-z0-9-]{1,48}$/;
  function pickFolders(index) {
    var out = {};
    if (index && Array.isArray(index.batches)) index.batches.forEach(function (b) {
      var dir = b && typeof b.path === 'string' ? b.path.replace(/\/+$/, '').split('/').pop() : '', m = FOLDER_RE.exec(dir);
      if (m && !out[m[1]]) out[m[1]] = dir;
    });
    return out;
  }
  function okPath(p) { return typeof p === 'string' && /^[A-Za-z0-9_.\/-]{1,160}$/.test(p) && p.indexOf('..') < 0 && p.charAt(0) !== '/'; }
  function join(a, b) { return String(a).replace(/\/+$/, '') + '/' + String(b).replace(/^\/+/, ''); }

  function MiniSet() { this.art = Object.create(null); this.warn = []; this._fb = Object.create(null); }
  MiniSet.prototype.has = function (id) { return !!this.art[id]; };
  MiniSet.prototype.source = function (id) { return this.art[id] ? 'art' : (spec(id) ? 'code' : 'none'); };
  MiniSet.prototype.frameAt = function (id, t) {
    var s = spec(id), a = this.art[id], n = a ? a.frames : (s ? s.frames : 1), fps = a ? a.fps : (s ? s.fps : 0), loop = a ? a.loop : !!(s && s.loop);
    if (!(fps > 0) || n <= 1) return 0;
    var k = Math.floor(Math.max(0, Number(t) || 0) * fps);
    return loop ? k % n : Math.min(k, n - 1);
  };
  // canvas(id, frame) -> the procedural fallback as a canvas (browser; cached), or null without a DOM
  MiniSet.prototype.canvas = function (id, frame) {
    var key = id + '#' + (frame || 0); if (this._fb[key] !== undefined) return this._fb[key];
    var px = pixels(id, frame), cv = null;
    try {
      if (px && typeof document !== 'undefined') {
        cv = document.createElement('canvas'); cv.width = px.w; cv.height = px.h;
        var g = cv.getContext('2d'), im = g.createImageData(px.w, px.h); im.data.set(px.data); g.putImageData(im, 0, 0);
      }
    } catch (e) { cv = null; }
    this._fb[key] = cv; return cv;
  };
  // draw(ctx, id, t, x, y, opts?) at native size x opts.scale; (x, y) is the anchor (sprites: manifest anchor / up; icons: top-left unless opts.center).
  // Returns 'art', 'code' or '' (nothing drawn). Never throws.
  MiniSet.prototype.draw = function (ctx, id, t, x, y, opts) {
    try {
      var o = opts || {}, sc = Number(o.scale) > 0 ? Number(o.scale) : 1, s = spec(id), a = this.art[id], f = this.frameAt(id, t);
      if (!ctx || (!a && !s)) return '';
      var prev = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
      var img, sx, sw, sh, up, ax, ay;
      if (a) { img = a.img; sx = f * a.fw; sw = a.fw; sh = a.fh; up = a.up; ax = a.ax; ay = a.ay; }
      else { img = this.canvas(id, f); if (!img) return ''; sx = 0; sw = s.w; sh = s.h; up = 1; ax = s.kind === 'sprite' ? s.w / 2 : 0; ay = s.kind === 'sprite' ? s.h / 2 : 0; }
      var dw = sw / up * sc, dh = sh / up * sc, dx = x - ax / up * sc, dy = y - ay / up * sc;
      if (o.center && (!s || s.kind !== 'sprite')) { dx = x - dw / 2; dy = y - dh / 2; }
      if (o.flip) { ctx.save(); ctx.translate(Math.round(dx + dw), Math.round(dy)); ctx.scale(-1, 1); ctx.drawImage(img, sx, 0, sw, sh, 0, 0, dw, dh); ctx.restore(); }
      else ctx.drawImage(img, sx, 0, sw, sh, Math.round(dx), Math.round(dy), dw, dh);
      ctx.imageSmoothingEnabled = prev;
      return a ? 'art' : 'code';
    } catch (e) { return ''; }
  };

  // load(batches?, opts?) -> Promise<MiniSet>. batches: ['m02', 'm08'] (default all). opts: { root: assets/arcane url, fetch, Image, folders: { m02: 'm02-angler-fish' } }.
  // Reads INDEX.json, then each batch manifest; an asset is accepted only if its id is in the spec table (or a bug_ id), its path is a safe
  // relative path and the image holds frames x frame_w by frame_h. Everything else stays on the code fallback. Never rejects.
  function load(batches, opts) {
    var o = opts || {}, set = new MiniSet(), want = Array.isArray(batches) && batches.length ? batches.filter(function (b) { return BATCHES[b]; }) : Object.keys(BATCHES);
    var root = o.root || '../../assets/arcane', F = o.fetch || (typeof fetch === 'function' ? fetch : null), Img = o.Image || (typeof Image === 'function' ? Image : null);
    if (!F || !Img) return Promise.resolve(set);
    function json(u) { return Promise.resolve().then(function () { return F(u); }).then(function (r) { return r && r.ok ? r.json() : null; }).catch(function () { return null; }); }
    var folders = o.folders ? Promise.resolve(o.folders) : json(join(root, 'INDEX.json')).then(pickFolders);
    return folders.then(function (dirs) {
      return Promise.all(want.map(function (b) {
        var dir = dirs && dirs[b]; if (!dir || !/^[a-z0-9-]{1,64}$/.test(dir)) return null;
        return json(join(join(root, dir), 'manifest.json')).then(function (m) {
          var assets = m && Array.isArray(m.assets) ? m.assets : [];
          return Promise.all(assets.map(function (a) {
            var s = a && spec(a.id);
            if (!s || s.batch !== b || !okPath(a.path)) { if (a && a.id) set.warn.push(String(a.id).slice(0, 64) + ': unknown id or bad path'); return null; }
            var frames = Number.isInteger(a.frames) && a.frames >= 1 && a.frames <= 32 ? a.frames : s.frames;
            var fw = Number(a.frame_w) || s.w * s.up, fh = Number(a.frame_h) || s.h * s.up, up = Math.max(1, Math.round(fw / s.w));
            var an = a.anchor && typeof a.anchor === 'object' ? a.anchor : {};
            return new Promise(function (res) {
              var img = new Img();
              img.onload = function () {
                if (img.naturalWidth >= fw * frames && img.naturalHeight >= fh) {
                  set.art[a.id] = { img: img, frames: frames, fw: fw, fh: fh, up: up, fps: Number(a.fps) > 0 ? Math.min(Number(a.fps), 30) : s.fps, loop: a.loop === undefined ? s.loop : !!a.loop,
                    ax: Number.isFinite(an.x) ? an.x : (s.kind === 'sprite' ? fw / 2 : 0), ay: Number.isFinite(an.y) ? an.y : (s.kind === 'sprite' ? fh / 2 : 0) };
                } else set.warn.push(a.id + ': image smaller than frames x cell');
                res();
              };
              img.onerror = function () { set.warn.push(a.id + ': image failed'); res(); };
              img.src = join(join(root, dir), a.path);
            });
          }));
        });
      }));
    }).then(function () { return set; }).catch(function () { return set; });
  }

  return { BATCHES: BATCHES, PAL: PAL, RIM: RIM, ids: ids, spec: spec, batchFor: batchFor, pixels: pixels, pickFolders: pickFolders, load: load, MiniSet: MiniSet };
});
