#!/usr/bin/env node
// Town star economy sim (cycle 7 D). Pure node, no browser, no network, nothing written. Run: node game/tools/town-economy-sim.js
// Uses the REAL turnip price formulas (copied from main.js turnipHashedPrice / turnipSellPrice) over real wall-clock buckets, and reads the
// constants out of main.js by text so a drift in the source shows up here (it throws if a constant is missing).
const fs = require('fs'); const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
function num(name) { const m = src.match(new RegExp('const ' + name + '\\s*=\\s*([0-9.*\\s]+?);')); if (!m) throw new Error('constant missing: ' + name); return Function('return ' + m[1])(); }
const C = { BUNDLE: num('TURNIP_BUNDLE'), BUY_MS: num('TURNIP_BUY_CYCLE_MS'), SELL_MS: num('TURNIP_SELL_CYCLE_MS'), SPIKE: num('TURNIP_SPIKE_CHANCE'),
  CAP: num('TURNIP_DAILY_BUNDLE_CAP'), DAILY: num('DAILY_BONUS'), MERCH: num('MERCHANT_COST'), GIFT: num('MERCHANT_GIFT_BOX_COST'),
  QBASE: num('QUEST_REWARD_BASE'), BDAY: num('BIRTHDAY_STARS'), HOMECAP: num('HOME_BONUS_CAP'), DEAL: num('DAILY_DEAL_BONUS'), BULK: num('BULK_SELL_BONUS') };
const DAY = 86400000;
function hashed(bucket) { const h = Math.sin(bucket * 12.9898) * 43758.5453; return h - Math.floor(h); }
const buyAt = (t) => Math.round(90 + hashed(Math.floor(t / C.BUY_MS) + 1000) * 40);
const sellAt = (t) => { const f = hashed(Math.floor(t / C.SELL_MS) + 7000); const n = 1 - C.SPIKE; return f < n ? Math.round(30 + (f / n) * 80) : Math.round(140 + ((f - n) / C.SPIKE) * 60); };
const t0 = Date.UTC(2026, 10, 25);
const say = (s) => console.log(s);
// 1. price distributions over 365 real days
let sb = 0, ss = 0, nb = 0, ns = 0, spikes = 0, minB = 999, maxB = 0;
for (let t = t0; t < t0 + 365 * DAY; t += C.SELL_MS) { const p = sellAt(t); ss += p; ns++; if (p >= 140) spikes++; }
for (let t = t0; t < t0 + 365 * DAY; t += C.BUY_MS) { const p = buyAt(t); sb += p; nb++; minB = Math.min(minB, p); maxB = Math.max(maxB, p); }
say(`turnip buy price per bundle: mean ${(sb / nb).toFixed(1)} range ${minB}-${maxB}; sell price per bundle: mean ${(ss / ns).toFixed(1)}, spike windows ${(100 * spikes / ns).toFixed(1)} percent (nominal ${C.SPIKE * 100})`);
// 2. strategies: per day buy CAP bundles then sell within a horizon; profit per bundle
function strat(name, buyMode, sellMode, horizonDays) {
  let profit = 0, bundles = 0; const days = 360;
  for (let d = 0; d < days; d++) {
    const day0 = t0 + d * DAY; let buy;
    if (buyMode === 'now') buy = buyAt(day0 + 12 * 3600000); else { buy = 999; for (let h = 0; h < 6; h++) buy = Math.min(buy, buyAt(day0 + h * C.BUY_MS)); }
    let sell;
    if (sellMode === 'now') sell = sellAt(day0 + 12 * 3600000);
    else { sell = 0; for (let t = day0; t < day0 + horizonDays * DAY; t += C.SELL_MS) sell = Math.max(sell, sellAt(t)); }
    profit += (sell - buy) * C.CAP; bundles += C.CAP;
  }
  const per = profit / bundles; say(`  ${name}: ${per >= 0 ? '+' : ''}${per.toFixed(1)} stars per bundle, ${(profit / days).toFixed(0)} stars per day for ${C.CAP} bundles`);
  return profit / days;
}
say('turnip strategies (cap ' + C.CAP + ' bundles per UTC day, holding is free):');
const sNow = strat('buy at noon, sell at noon', 'now', 'now', 1);
const sMin = strat('buy at the daily low, sell at once', 'min', 'now', 1);
const sBest1 = strat('buy at the daily low, sell at the best of 96 windows in 1 day', 'min', 'best', 1);
const sBest3 = strat('buy at the daily low, sell at the best price in 3 days', 'min', 'best', 3);
const sBest7 = strat('buy at the daily low, sell at the best price in 7 days', 'min', 'best', 7);
// 3. daily fixed income vs gather income
const quest = C.QBASE + 6; const fixed = 5 + quest + C.DAILY + C.BDAY / 10 + C.HOMECAP + 5;
const gatherPerMin = 33;
say(`fixed daily income (login 5 + quest ~${quest} + chores ${C.DAILY} + birthday ${C.BDAY}/10 days + home <= ${C.HOMECAP} + sell streak 5) = about ${fixed.toFixed(0)} stars = ${(fixed / gatherPerMin).toFixed(1)} min of gathering at ${gatherPerMin} stars/min (cycle 3 bot)`);
for (const mins of [5, 15, 30, 60]) say(`  ${mins} min a day of gathering: ${(mins * gatherPerMin + fixed).toFixed(0)} stars per day`);
// 4. sinks vs income
say(`sinks: merchant look ${C.MERCH}, gift boxes ${C.GIFT} (once a day), turnip bundle ${(sb / nb).toFixed(0)} avg (${minB}-${maxB}). Merchant look = ${(C.MERCH / gatherPerMin * 60).toFixed(0)} s of gathering; gift boxes = ${(C.GIFT / gatherPerMin * 60).toFixed(0)} s.`);
say(`best turnip patience (${sBest7.toFixed(0)} stars/day over 7 days) = ${(sBest7 / gatherPerMin).toFixed(1)} min of gathering per day; selling blind the same day (${sNow.toFixed(0)}/day) loses ${(-sNow / gatherPerMin).toFixed(1)} min per day`);
say('polyroll: dice pays 5x on a 1-in-6 pick (EV 0), coin pays 1x on 50/50 (EV 0): neutral sinks.');
module.exports = { C, sNow, sMin, sBest1, sBest3, sBest7, fixed, mean: { buy: sb / nb, sell: ss / ns }, spikeShare: spikes / ns, buyAt, sellAt };
