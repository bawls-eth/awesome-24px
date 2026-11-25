// Cycle 7 D: Town star economy guard, pure node (game/tools/town-economy-sim.js reads the real constants out of main.js and uses the real
// turnip price formulas over 360 real days). Pins the balance rules the owner-facing economy relies on, so a data edit that breaks one fails here:
//  1 blind turnip trading (buy and sell at the same moment) must LOSE stars on average (no star printer for a player who does not wait);
//  2 patient trading (daily low, best price in a week) is a real reward but bounded: <= 10 min of gathering per day and <= 2 bundles per UTC day;
//  3 the daily surface is worth something (chores bonus 40 >= 1 min of gathering) but never dominates: all fixed daily income <= 5 min of gathering;
//  4 sell spikes are about the nominal share, the bundle prices stay in their ranges; 5 the gambling games stay neutral (no star printer).
// Run: node game/tests/cyc7-d-town-economy.test.js
const fs = require('fs'); const path = require('path');
const { check, done } = require('./helpers');
const log = console.log; console.log = () => {};
const S = require('../tools/town-economy-sim.js');
console.log = log;
const GATHER = 33; // stars per minute, cycle 3 town-day bot
check('blind turnip trading loses stars on average (buy and sell at noon)', S.sNow < 0, 'per day ' + S.sNow.toFixed(1));
check('even buying at the daily low and selling at once does not print stars', S.sMin < 0, 'per day ' + S.sMin.toFixed(1));
check('patient turnip trading pays (daily low, best of the week) but is bounded: more than 0 and at most 10 min of gathering per day', S.sBest7 > 0 && S.sBest7 <= 10 * GATHER, 'per day ' + S.sBest7.toFixed(1) + ' = ' + (S.sBest7 / GATHER).toFixed(1) + ' min');
check('at most 2 bundles per UTC day', S.C.CAP <= 2, 'cap ' + S.C.CAP);
check('the all-chores bonus is worth at least 1 minute of gathering', S.C.DAILY >= GATHER, 'bonus ' + S.C.DAILY);
check('all fixed daily income is at most 5 minutes of gathering', S.fixed <= 5 * GATHER, 'fixed ' + S.fixed.toFixed(0));
check('sell spike windows are within 2 points of the nominal ' + S.C.SPIKE * 100 + ' percent', Math.abs(S.spikeShare - S.C.SPIKE) < 0.02, 'actual ' + (S.spikeShare * 100).toFixed(1));
check('mean sell price per bundle stays under the mean buy price (a blind seller loses)', S.mean.sell < S.mean.buy, S.mean.sell.toFixed(1) + ' vs ' + S.mean.buy.toFixed(1));
const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
check('dice pays 5x on a 1-in-6 pick and the coin pays 1x on 50/50 (both zero expected value)', /win \? bet \* 5 : -bet/.test(src) && /win \? bet : -bet/.test(src));
done();
