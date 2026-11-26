#!/usr/bin/env node
// ID-64 economy check (cycle 14 D). Pure node, no browser, no network, nothing written. Run: node game/tools/id64-build-sim.js
// Reads the REAL constants out of realm.js / mm-unlocks.js by text (throws if one is missing) and models:
//   1. payout side: XP and shards on the way to Lv 5, and what the shop sells then (does a Lv 5 build choice touch any payout?)
//   2. the two candidate "ability 1" (Dash) options against the base Dash and the Lv 16 Dash II step.
// This is a model plus the cycle 11/12 bot data (ftue-metrics.json), never human play data.
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..');
const realm = fs.readFileSync(path.join(root, 'realm.js'), 'utf8');
const unl = fs.readFileSync(path.join(root, 'shared', 'mm-unlocks.js'), 'utf8');
const metrics = JSON.parse(fs.readFileSync(path.join(root, 'design', 'ftue-metrics.json'), 'utf8'));
function need(re, what) { const m = realm.match(re); if (!m) throw new Error('missing in realm.js: ' + what); return m; }
const xpFn = need(/function rmXpNeeded\(level\) \{ return (\d+) \+ (\d+) \* \(level - 1\); \}/, 'rmXpNeeded');
const xpNeeded = (lv) => Number(xpFn[1]) + Number(xpFn[2]) * (lv - 1);
const xpBy = JSON.parse(need(/const RM_XP = (\{[^}]*\});/, 'RM_XP')[1].replace(/(\w+):/g, '"$1":'));
const sh = {}; ['spiral', 'aimed', 'ring', 'boss'].forEach((k) => { sh[k] = Number(need(new RegExp(k + ": \\{ name: '[^']+', hp: \\d+, r: \\d+, shards: (\\d+)"), 'shards ' + k)[1]); });
const mult = Number(need(/const RM_SHOP_MULT = (\d+);/, 'RM_SHOP_MULT')[1]);
const sell = [3, 7, 15]; // RM_RARITIES common / uncommon / rare sell values (read below as a drift guard)
need(/id: 'common'[^}]*sell: 3 \}/, 'common sell 3'); need(/id: 'uncommon'[^}]*sell: 7 \}/, 'uncommon sell 7'); need(/id: 'rare'[^}]*sell: 15 \}/, 'rare sell 15');
const unlockLv = JSON.parse(need(/const RM_SHOP_UNLOCK_LV = (\[[^\]]*\]);/, 'RM_SHOP_UNLOCK_LV')[1]);
const dash = need(/id: 'dash', key: 'q', icon: '[^']*', name: 'Dash', level: 1, cd: (\d+)/, 'dash')[1] * 1;
const dashIframes = 0.4; const dashDist = 150; // cast(): p.iframes = max(p.iframes, 0.4); 15 steps x 10 px
if (!/p\.iframes = Math\.max\(p\.iframes, 0\.4\)/.test(realm)) throw new Error('dash iframes drifted');
const dash2 = unl.match(/id: 'dash2_16', lv: 16[^\n]*ab\('dash', 'cooldown', ([\d.]+)\)/); if (!dash2) throw new Error('Dash II missing');
const guestMinCd = 2.4; // _abCd: the host enforces 2.4 s between a guest's dashes; realm-team.js reach 160 px

const say = (s) => console.log(s);
say('1. PAYOUT SIDE (what a hero earns on the way to the first build card)');
let xpTo5 = 0; for (let l = 1; l < 5; l++) xpTo5 += xpNeeded(l);
const kinds = ['spiral', 'aimed', 'ring']; const avgXp = kinds.reduce((a, k) => a + xpBy[k], 0) / 3; const avgSh = kinds.reduce((a, k) => a + sh[k], 0) / 3;
say(`  XP to reach Lv 5: ${xpTo5} (levels 1-4: ${[1, 2, 3, 4].map(xpNeeded).join('+')}); a normal kill gives ${kinds.map((k) => k + ' ' + xpBy[k]).join(', ')} (mean ${avgXp.toFixed(2)}, wave 1) -> about ${Math.ceil(xpTo5 / avgXp)} kills`);
say(`  shards on the way: mean ${avgSh.toFixed(2)} per kill (${kinds.map((k) => k + ' ' + sh[k]).join(', ')}) -> about ${Math.round(Math.ceil(xpTo5 / avgXp) * avgSh)} shards (before the shard ring bonus), boss ${sh.boss}`);
say(`  shop at Lv 5: Common ${sell[0] * mult}, Uncommon ${sell[1] * mult} (unlocks at Lv ${unlockLv[1]}), Rare ${sell[2] * mult} (unlocks at Lv ${unlockLv[2]}); so the card arrives with about one Uncommon of shards banked`);
const w = metrics.world; const lv = Object.keys(w).map((k) => w[k].level); const casts = Object.keys(w).map((k) => w[k].casts[0]); const secs = Object.keys(w).map((k) => w[k].simSeconds);
say(`  bot data (ftue-metrics.json, 6 Shore seeds): first level-up 6.8-29.7 s, Lv ${Math.min(...lv)}-${Math.max(...lv)} by ${secs[0]} s, deaths ${Object.keys(w).map((k) => w[k].deaths).join('/')}, min HP ${Math.min(...Object.keys(w).map((k) => w[k].minHp))}-${Math.max(...Object.keys(w).map((k) => w[k].minHp))}`);
say(`  bot Dash use: ${Math.min(...casts)}-${Math.max(...casts)} casts in ${secs[0]} s = one every ${(secs[0] / Math.max(...casts)).toFixed(1)}-${(secs[0] / Math.min(...casts)).toFixed(1)} s, against a ${dash} s cooldown: the cooldown is not what limits the bot`);

say('2. OPTIONS FOR ABILITY 1 (Dash): per minute of sustained use (a human who dashes the moment it is ready; the upper bound)');
const opts = [
  { id: 'base', name: 'Base Dash', cdMul: 1, dist: dashDist },
  { id: 'a', name: 'A Long dash (+33% distance, +15% cooldown)', cdMul: 1.15, dist: 200 },
  { id: 'b', name: 'B Quick dash (-10% cooldown)', cdMul: 0.9, dist: dashDist },
];
function row(o, lvl16) {
  const cd = lvl16 ? Math.max(o.id === 'base' ? 1 : 1, parseFloat(dash2[1]) * o.cdMul) : dash * o.cdMul;
  const per = 60 / cd; return { cd, casts: per, iframe: per * dashIframes, dist: per * o.dist, pctUp: 100 * dashIframes / cd };
}
for (const lvl16 of [false, true]) {
  say(lvl16 ? '  at Lv 16+ (Dash II sets the cooldown to ' + dash2[1] + ' s, then the option multiplies it):' : '  at Lv 5-15 (cooldown ' + dash + ' s):');
  const b = row(opts[0], lvl16);
  opts.forEach((o) => {
    const r = row(o, lvl16);
    say(`    ${o.name.padEnd(46)} cd ${r.cd.toFixed(2)} s  invulnerable ${r.iframe.toFixed(1)} s/min (${(100 * (r.iframe / b.iframe - 1)).toFixed(0).padStart(4)}%, ${r.pctUp.toFixed(1)}% of the time)  distance ${r.dist.toFixed(0)} px/min (${(100 * (r.dist / b.dist - 1)).toFixed(0).padStart(4)}%)`);
  });
}
say(`  Dash II (Lv 16, cooldown 3 -> ${dash2[1]} s = ${(100 * (parseFloat(dash2[1]) / dash - 1)).toFixed(0)}%) is the existing reward for this stat: option B alone (-10%) stays below it, A and B stack with it and the cooldown floor is 1 s.`);
say(`  co-op: the host enforces at least ${guestMinCd} s between a guest's dashes and moves the guest 160 px (realm-team.js), so a +33% distance option would not match on the host (guest keeps 150); B at 2.7 s clears the 2.4 s floor.`);
say('3. VERDICT INPUTS');
say('  payouts: neither option touches XP, shards, drops or damage (Dash only moves the hero, grants 0.4 s of safe time, starts its cooldown): payout delta 0.');
say('  sinks: none needed; a re-choice is free (Settings line), so no star/shard sink is added or changed.');
