// Cycle 16 S (1): seeded fuzz of the Town claim-key merge (main.js townLayerSave + TOWN_CLAIM_MERGE: fishlog, weedsPulled, birthdays, home).
// Node only, no browser, no storage, no network. The merge block of main.js is evaluated in a vm sandbox (main.js is a browser script).
// Each run: 2-3 "tabs" with their own stale copy share one fake save; ops are claims written the way main.js writes them (writeSave:
// storage <- layer(layer(stored, pending), partial)), REFUSED writes (kept in the tab's pending, layered the same way) and late flushes.
// Invariants:
//   C1 every claim any tab wrote (weed id on the stored day, milestone id, birthday id among the newest 40, guest) is in storage once all
//      pending writes landed; fish counts / bests / lastDay / home paidDay are never below what any tab wrote
//   C2 no duplicates in any merged list; birthdays.claimed <= 40
//   C3 hostile stored values (null, arrays, strings, numbers, nested junk) never throw and never drop the writer's own value
//   C4 unknown fields of either side are kept (forward compatible), keys outside the four are replaced as before (spread)
// Run: node game/tests/cyc16-s-claim-merge-fuzz.test.js   (FUZZ_RUNS=n, FUZZ_SEED=s)
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
let fails = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${!ok && detail ? ' :: ' + detail : ''}`); if (!ok) fails++; };

const grab = (start, endMarker) => { const i = src.indexOf(start); const j = src.indexOf(endMarker, i); return i >= 0 && j > i ? src.slice(i, j) : null; };
const cc = grab('function cleanCount(v) {', '\n}\n');
const block = grab('const townIsObj =', '// SAVE_PENDING plus the turnip count');
check('main.js has the claim-merge block (townIsObj .. townLayerSave)', !!cc && !!block && /function townLayerSave/.test(block || ''));
if (!cc || !block) { console.log('\n1 FAILED'); process.exit(1); }
const sb = { console }; vm.createContext(sb);
vm.runInContext(cc + '\n}\n' + block + '\nglobalThis.L = townLayerSave; globalThis.M = TOWN_CLAIM_MERGE;', sb);
const { L, M } = sb;
check('the four claim keys are merged', ['fishlog', 'weedsPulled', 'birthdays', 'home'].every((k) => typeof M[k] === 'function'), Object.keys(M).join(','));

let seed = Number(process.env.FUZZ_SEED) || 0x16c5;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x80000000; };
const ri = (n) => Math.floor(rnd() * n);
const clone = (o) => JSON.parse(JSON.stringify(o));
const RUNS = Number(process.env.FUZZ_RUNS) || 3000;
const SPECIES = ['a', 'b', 'c', 'd', 'e'];
let bad = { C1: 0, C2: 0, C3: 0 }; let first = {};
const note = (k, d) => { bad[k]++; if (!first[k]) first[k] = d; };
const DAY = 20000;

for (let run = 0; run < RUNS; run++) {
  let storage = { name: 'x', other: 1 };
  const tabs = Array.from({ length: 2 + ri(2) }, () => ({ mem: clone(storage), pending: null }));
  const wrote = { weeds: new Map(), claimed: new Set(), bday: [], guests: new Set(), fish: {}, lastDay: 0, paidDay: 0 };
  const write = (t, partial, refuse) => {
    if (refuse) { t.pending = L(t.pending || {}, partial); return; }
    storage = L(L(storage, t.pending || {}), partial); t.pending = null; t.mem = clone(storage);
  };
  for (let op = 0; op < 30; op++) {
    const t = tabs[ri(tabs.length)];
    const refuse = rnd() < 0.15;
    const m = t.mem; const k = ri(5);
    if (k === 0) { // weed pull on day DAY or DAY+1 (a new day replaces the old one)
      const day = DAY + (rnd() < 0.85 ? 0 : 1); const id = ri(24);
      const cur = m.weedsPulled && m.weedsPulled.day === day ? m.weedsPulled.ids.slice() : [];
      if (!cur.includes(id)) cur.push(id);
      m.weedsPulled = { day, ids: cur }; write(t, { weedsPulled: m.weedsPulled }, refuse);
      if (!wrote.weeds.has(day)) wrote.weeds.set(day, new Set()); wrote.weeds.get(day).add(id);
    } else if (k === 1) { // fish catch / milestone claim
      const fl = m.fishlog && typeof m.fishlog === 'object' ? clone(m.fishlog) : { caught: {}, claimed: [], lastDay: 0 };
      const sp = SPECIES[ri(SPECIES.length)]; const e = fl.caught[sp] || { n: 0, best: 0 };
      e.n += 1; e.best = Math.max(e.best, ri(80)); fl.caught[sp] = e; fl.lastDay = DAY + ri(3);
      if (rnd() < 0.3) { const c = ['set4', 'set8'][ri(2)]; if (!fl.claimed.includes(c)) fl.claimed.push(c); wrote.claimed.add(c); }
      m.fishlog = fl; write(t, { fishlog: fl }, refuse);
      wrote.fish[sp] = Math.max(wrote.fish[sp] || 0, e.n); wrote.lastDay = Math.max(wrote.lastDay, fl.lastDay);
    } else if (k === 2) { // birthday gift
      const b = m.birthdays && typeof m.birthdays === 'object' ? clone(m.birthdays) : { claimed: [], guests: [] };
      const id = `${DAY + ri(60)}:v${ri(4)}`; const g = 'v' + ri(4);
      if (!b.claimed.includes(id)) b.claimed.push(id); if (!b.guests.includes(g)) b.guests.push(g);
      b.claimed = b.claimed.slice(-40);
      m.birthdays = b; write(t, { birthdays: b }, refuse); wrote.bday.push(id); wrote.guests.add(g);
    } else if (k === 3) { // home bonus day
      const h = m.home && typeof m.home === 'object' ? clone(m.home) : { slots: [], tank: [], paidDay: 0 };
      h.paidDay = DAY + ri(3); m.home = h; write(t, { home: h }, refuse); wrote.paidDay = Math.max(wrote.paidDay, h.paidDay);
    } else { // a plain write (flushes pending) or a storage event reaching this tab
      if (rnd() < 0.5) write(t, { other: ri(9) }, refuse); else t.mem = clone(storage);
    }
  }
  tabs.forEach((t) => { if (t.pending) write(t, {}, false); }); // storage works again: every tab's next write lands
  const s = storage;
  const lastDay = Math.max(...wrote.weeds.keys(), -1);
  if (lastDay >= 0) {
    const ids = s.weedsPulled && s.weedsPulled.ids || [];
    if (s.weedsPulled.day !== lastDay || [...wrote.weeds.get(lastDay)].some((i) => !ids.includes(i))) note('C1', { run, weeds: s.weedsPulled, want: [...wrote.weeds.get(lastDay)] });
    if (new Set(ids).size !== ids.length) note('C2', { run, ids });
  }
  if (s.fishlog) {
    if ([...wrote.claimed].some((c) => !s.fishlog.claimed.includes(c))) note('C1', { run, claimed: s.fishlog.claimed, want: [...wrote.claimed] });
    if (Object.keys(wrote.fish).some((sp) => !s.fishlog.caught[sp] || s.fishlog.caught[sp].n < wrote.fish[sp])) note('C1', { run, fish: s.fishlog.caught, want: wrote.fish });
    if (s.fishlog.lastDay < wrote.lastDay) note('C1', { run, lastDay: s.fishlog.lastDay });
    if (new Set(s.fishlog.claimed).size !== s.fishlog.claimed.length) note('C2', { run });
  }
  if (s.birthdays) {
    const newest = [...new Set(wrote.bday)].sort((x, y) => parseInt(x, 10) - parseInt(y, 10)).slice(-40);
    const minDay = parseInt(newest[0], 10);
    const need = newest.filter((id) => parseInt(id, 10) > minDay); // ties at the cut day may go either way
    if (need.some((id) => !s.birthdays.claimed.includes(id)) || [...wrote.guests].some((g) => !s.birthdays.guests.includes(g))) note('C1', { run, b: s.birthdays });
    if (s.birthdays.claimed.length > 40 || new Set(s.birthdays.claimed).size !== s.birthdays.claimed.length) note('C2', { run, n: s.birthdays.claimed.length });
  }
  if (s.home && s.home.paidDay < wrote.paidDay) note('C1', { run, paid: s.home.paidDay, want: wrote.paidDay });
}
check(`C1 every claim any tab wrote is stored after ${RUNS} runs (refused writes and stale tabs)`, bad.C1 === 0, `${bad.C1} runs; first ${JSON.stringify(first.C1)}`);
check('C2 no duplicates, birthdays.claimed <= 40', bad.C2 === 0, `${bad.C2} runs; first ${JSON.stringify(first.C2)}`);

// C3 hostile stored values
const JUNK = [null, undefined, 0, 7, 'x', [], [1, 2], {}, { caught: 'x', claimed: 'y', ids: {}, guests: 5, day: 'z', paidDay: -4 }, { caught: { a: null, b: [1], c: { n: 'q' } } }];
const MINE = { fishlog: { caught: { a: { n: 2, best: 9 } }, claimed: ['set4'], lastDay: 3 }, weedsPulled: { day: DAY, ids: [3] }, birthdays: { claimed: [`${DAY}:v1`], guests: ['v1'] }, home: { slots: ['p'], tank: [null], paidDay: DAY } };
let c3 = 0, c3d = '';
JUNK.forEach((j) => Object.keys(MINE).forEach((k) => {
  try {
    const out = L({ [k]: j }, { [k]: MINE[k] })[k];
    const ok = k === 'fishlog' ? out.claimed.includes('set4') && out.caught.a.n === 2
      : k === 'weedsPulled' ? out.ids.includes(3) : k === 'birthdays' ? out.claimed.includes(`${DAY}:v1`) && out.guests.includes('v1') : out.paidDay === DAY && out.slots[0] === 'p';
    if (!ok) { c3++; c3d = c3d || `${k} on ${JSON.stringify(j)} -> ${JSON.stringify(out)}`; }
  } catch (e) { c3++; c3d = c3d || `${k} on ${JSON.stringify(j)} threw ${e.message}`; }
}));
check('C3 hostile stored values never throw and keep the writer\'s own claim', c3 === 0, c3d);

// C4 forward compatible + other keys unchanged
const fw = L({ fishlog: { caught: { zz: { n: 4, best: 1, gold: true } }, claimed: [], lastDay: 0, future: 1 }, coins: 5, stars: 9 }, { fishlog: { caught: { a: { n: 1, best: 2 } }, claimed: [], lastDay: 0 }, stars: 3 });
check('C4 a species / field only a newer build knows is kept', fw.fishlog.caught.zz && fw.fishlog.caught.zz.gold === true && fw.fishlog.future === 1 && fw.fishlog.caught.a.n === 1, JSON.stringify(fw.fishlog));
check('C4 keys outside the four still spread as before (stars replaced, coins kept)', fw.stars === 3 && fw.coins === 5);
const nd = L({ weedsPulled: { day: DAY + 1, ids: [5] } }, { weedsPulled: { day: DAY, ids: [3] } }).weedsPulled;
check('weeds: a stale tab\'s yesterday write never replaces today\'s pulls', nd.day === DAY + 1 && nd.ids.join() === '5', JSON.stringify(nd));
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
