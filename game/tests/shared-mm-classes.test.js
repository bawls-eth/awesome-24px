// Run: node game/tests/shared-mm-classes.test.js
const M = require('../shared/mm-classes.js');
let n = 0, bad = 0;
function check(name, ok) { n++; if (!ok) { bad++; console.log('FAIL ' + name); } }
function done() { console.log((bad ? 'FAILED ' + bad + ' of ' : 'ok ') + n + ' assertions'); process.exit(bad ? 1 : 0); }
const cast = M.cast, C = M.CLASSES;
const base = { x: 10, y: 10, aim: { x: 14, y: 10 }, facing: 0, focus: 200, pow: 10, wit: 10 };

let r = cast('ranger', 'yarnSnare', base);
check('snare cost 40', r.cost === 40 && r.focusAfter === 160);
check('snare root 2s', r.effects[0].type === 'root' && r.effects[0].sec === 2);
check('snare +15% dmg', r.effects[1].dmgTakenMult === 1.15);
check('snare range capped 7', cast('ranger', 'yarnSnare', Object.assign({}, base, { aim: { x: 50, y: 10 } })).effects[0].at.x === 17);
r = cast('frostcaller', 'shards', base);
check('shards 12, 30% slow, cost 60', r.effects[0].count === 12 && r.effects[0].slow === 0.3 && r.cost === 60);
r = cast('herald', 'heal', base);
check('herald heal 60+2*WIT', r.effects[0].amount === 80);
check('herald +10 GRD within 5 tiles', r.effects[1].grd === 10 && r.effects[1].radius === 5);
r = cast('bruiser', 'groundPound', base);
check('pound knockback 2 and dmg 90+2*POW', r.effects[1].tiles === 2 && r.effects[0].amount === 110);
check('siphon cost 65', cast('graveTender', 'siphon', base).cost === 65);
check('siphon heal capped 120', M.siphonHeal(1000) === 120 && M.siphonHeal(100) === 50);
check('siphon effect cap', cast('graveTender', 'siphon', base, { hitCount: 10 }).effects[1].amount === 120);
r = cast('shadowPaw', 'smoke', base);
check('smoke 2.5s +50% volley', r.effects[0].sec === 2.5 && r.effects[1].mult === 1.5);

// Blink never in a wall over 100 attempts
let seed = 12345;
const rng = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const isWall = (x, y) => (((x * 7 + y * 13) % 3) + 3) % 3 === 0;
let inWall = 0;
for (let i = 0; i < 100; i++) {
  const c = Object.assign({}, base, { x: 10.5 + (i % 5), y: 10.5 + (i % 7), aim: { x: 20, y: 10 + (i % 9) } });
  if (isWall(Math.floor(c.x), Math.floor(c.y))) continue; // caster never starts inside a wall
  const e = cast('trickster', 'blink', c, { isWall, rng }).effects[0];
  if (isWall(Math.floor(e.to.x), Math.floor(e.to.y))) inWall++;
}
check('blink never ends in wall (100)', inWall === 0);
check('blink max 4 tiles', Math.abs(cast('trickster', 'blink', base, { isWall: () => false }).effects[0].to.x - 14) < 1e-9);
check('blink fully walled stays put', cast('trickster', 'blink', base, { isWall: () => true }).effects[0].moved === false);

// Mosh Shield frontal 120 degrees
check('shield blocks bolt from front', M.shieldBlocks(10, 10, 0, 14, 10, 120));
check('shield blocks at ~59 deg', M.shieldBlocks(10, 10, 0, 10 + Math.cos(1.03), 10 + Math.sin(1.03), 120));
check('shield passes bolt from behind', !M.shieldBlocks(10, 10, 0, 6, 10, 120));
check('shield passes at ~61 deg', !M.shieldBlocks(10, 10, 0, 10 + Math.cos(1.07), 10 + Math.sin(1.07), 120));
check('mosh arc 120', C.punk.ability.arcDeg === 120);

// Unlocks
check('ranger L5 -> punk', M.unlocks('ranger', 5).includes('punk') && !M.unlocks('ranger', 4).includes('punk'));
check('herald L5 -> bruiser', M.unlocks('herald', 5).includes('bruiser'));
check('frostcaller L10 -> graveTender', M.unlocks('frostcaller', 10).includes('graveTender') && !M.unlocks('frostcaller', 9).includes('graveTender'));
check('any L10 -> trickster', M.unlocks('punk', 10).includes('trickster') && M.unlocks('ranger', 10).includes('trickster'));
check('trickster L20 -> shadowPaw', M.unlocks('trickster', 20).includes('shadowPaw') && !M.unlocks('trickster', 19).includes('shadowPaw'));
check('start classes', M.START.join() === 'ranger,frostcaller,herald');

// Focus
check('regen 0.5+0.12*WIT', Math.abs(M.focusRegen(10) - 1.7) < 1e-9);
check('regen capped at max', M.regenFocus(99, 100, 50, 10) === 100);
check('cannot spend below zero', M.spend(30, 40).focus === 30 && !M.spend(30, 40).ok);
r = cast('ranger', 'yarnSnare', Object.assign({}, base, { focus: 10 }));
check('cast without focus fails, focus >= 0', !r.ok && r.focusAfter === 10 && r.effects.length === 0);
check('spend never negative', M.spend(-5, 10).focus === 0);
check('ability tier cost -3', M.abilityCost('ranger', 2) === 34);
check('base stats', C.ranger.base.life === 120 && C.ranger.cap.life === 560 && C.bruiser.base.foc === 90);
done();
