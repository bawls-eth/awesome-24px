// Unit tests for shared/profile.js (MMHubProfile) and shared/mm-map.js (MMMap). Run: node game/tests/shared-hub-map.test.js
const Prof = require('../shared/profile.js');
const M = require('../shared/mm-map.js');
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const done = () => { console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exitCode = failed ? 1 : 0; };
const memStore = (init) => { const d = Object.assign({}, init); return { d, getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); } }; };

// ---- profile seeding
{
  const town = JSON.stringify({ name: 'Ben', species: 'doge', frame: 3, sfxMuted: true, stars: 77, junk: [1, 2] });
  const st = memStore({ 'pixeltown-save-v1': town });
  const p = Prof.load(st, 1000);
  check('seeds name/species/frame from the town save', p.name === 'Ben' && p.species === 'doge' && p.frame === 3 && p.settings.sfxMuted === true, JSON.stringify(p));
  check('town save is byte-identical after seeding', st.d['pixeltown-save-v1'] === town);
  check('profile written to its own key only', !!st.d[Prof.KEY] && Object.keys(st.d).length === 2);
  const again = Prof.load(st, 2000);
  check('second load reads the stored profile (no reseed)', again.created === 1000);
}
{
  const st = memStore({ 'pixeltown-save-v1': JSON.stringify({ name: 5, species: ['x'], frame: 'zz' }) });
  const p = Prof.load(st, 1);
  check('corrupt town fields fall back per field', p.name === 'Villager' && p.species === 'coolcats' && p.frame === 0, JSON.stringify(p));
  const p2 = Prof.load(memStore({ 'pixeltown-save-v1': '{not json', [Prof.KEY]: '[1]' }), 1);
  check('corrupt JSON / non-object profile never throws', p2.name === 'Villager' && p2.v === 1);
  const p3 = Prof.sanitize({ name: 'Ann', species: 7, frame: 4, tokens: -5, nodes: 'x', results: 'y', extra: 'keep' });
  check('sanitize keeps good fields, fixes bad, keeps unknown keys', p3.name === 'Ann' && p3.species === 'coolcats' && p3.frame === 4 && p3.tokens === 0 && p3.extra === 'keep');
}

// ---- reportResult
{
  let p = Prof.defaults();
  for (let i = 0; i < 25; i++) p = Prof.reportResult(p, { node: 'w1-weed', exit: 'normal', medals: ['b'], tokens: 10, best: { timeMs: 5000 - i } });
  check('results list capped at 20', p.results.length === 20);
  check('Tokens added on every report', p.tokens === 250, String(p.tokens));
  check('best time keeps the minimum', p.nodes['w1-weed'].best.timeMs === 4976);
  p = Prof.reportResult(p, { node: 'w1-weed', exit: 'secret', medals: ['s', 'zz'], tokens: 0 });
  const n = p.nodes['w1-weed'];
  check('medals merge and exits accumulate', n.medals.b && n.medals.s && !n.medals.g && n.exits.includes('normal') && n.exits.includes('secret'));
  const before = JSON.stringify(p);
  check('invalid result is ignored', JSON.stringify(Prof.reportResult(p, { exit: 'normal' })) === before);
}

// ---- game milestones: sync / syncGame / goalsFor
{
  const nodeIds = new Set(M.MAP.nodes.map((n) => n.id));
  const hits = [];
  Object.keys(Prof.MILESTONES).forEach((g) => Prof.MILESTONES[g].forEach((m) => m.hits.forEach((h) => hits.push(h))));
  check('every milestone hit names a real map node, a known exit and medal', hits.every((h) => nodeIds.has(h.node) && ['normal', 'secret'].includes(h.exit) && [null, 'b', 's', 'g'].includes(h.medal)));
  check('secret milestones only target secret nodes', hits.filter((h) => h.exit === 'secret').every((h) => M.MAP.nodes.find((n) => n.id === h.node).secret === true));
  check('six games report, 4-8 milestones each', Object.keys(Prof.MILESTONES).length === 6 && Object.keys(Prof.MILESTONES).every((g) => Prof.MILESTONES[g].length >= 4 && Prof.MILESTONES[g].length <= 8));
  const town = JSON.stringify({ name: 'Ben' });
  const st = memStore({ 'pixeltown-save-v1': town });
  let r = Prof.sync(st, 'jam', [], 5);
  check('sync with nothing reached writes nothing', r.added.length === 0 && !(Prof.KEY in st.d));
  r = Prof.sync(st, 'jam', ['play', 'star1', false, 7, 'nope', 'star1'], 5);
  check('sync reports known ids once, ignores junk', JSON.stringify(r.added) === '["play","star1"]' && r.profile.nodes['w5-jam'].medals.b && r.profile.name === 'Ben', JSON.stringify(r.added));
  check('first milestone in any game clears First Steps (derived)', r.profile.nodes['w0-first'].exits.includes('normal'));
  const t1 = r.profile.tokens;
  r = Prof.sync(st, 'jam', ['play', 'star1'], 6);
  check('re-sync of the same ids adds no Tokens and writes nothing new', r.added.length === 0 && Prof.load(st).tokens === t1 && t1 === 30, String(t1));
  check('town save untouched by sync', st.d['pixeltown-save-v1'] === town);
  const unl = M.openPathIds(M.MAP, Prof.sync(st, 'angler', ['west', 'trout'], 7).profile);
  check('angler West Pond opens West -> East; the Trout is a comet', unl.includes('w4-west>w4-east') && Prof.load(st).comets.includes('w6-trout'));
  check('unknown game is ignored', Prof.sync(st, '__proto__', ['play']).added.length === 0 && Prof.syncGame(Prof.defaults(), 'zz', ['play']).added.length === 0);
  const hostile = Prof.syncGame({ games: { jam: { done: ['fullcombo', '<b>', 3] } } }, 'jam', ['fullcombo']);
  check('a stored done id is not re-reported (hostile entries dropped)', hostile.added.length === 0);
  const g = Prof.goalsFor(Prof.load(st), 'w4-west');
  check('goalsFor lists the clearing goal with its done flag', g.length === 1 && g[0].game === 'angler' && g[0].done === true && Prof.goalsFor(Prof.defaults(), 'w4-east')[0].done === false);
  check('goalsFor on an unknown node is empty', Prof.goalsFor(null, 'nope').length === 0);
  const fin = ['bugs:catch1', 'jam:star1', 'stalk:bronze'].reduce((p, x) => Prof.syncGame(p, x.split(':')[0], [x.split(':')[1]]).profile, Prof.defaults());
  check('Festival Finale clears when all three festival games reached their first medal', fin.nodes['w5-finale'].exits.includes('normal') && fin.nodes['w0-sparkle'].exits.includes('normal'));
}

// ---- arcade milestone group (additive: pop, dash, stack, echo clear their own map node's bronze / silver / gold)
{
  const nodes = Object.fromEntries(M.MAP.nodes.map((n) => [n.id, n]));
  const A = Prof.ARCADE;
  check('arcade group: pop, dash, stack, echo, 4 milestones each, never inside MILESTONES', JSON.stringify(Object.keys(A)) === '["pop","dash","stack","echo"]' && Object.keys(A).every((g) => A[g].length === 4 && !(g in Prof.MILESTONES)));
  check('each arcade milestone hits its own open game node with b, s, s, g', Object.keys(A).every((g) => A[g].every((m, i) => m.hits.length === 1 && m.hits[0].node === 'w5-' + g && nodes['w5-' + g] && nodes['w5-' + g].type === 'game' && !nodes['w5-' + g].secret && m.hits[0].exit === 'normal' && m.hits[0].medal === ['b', 's', 's', 'g'][i])));
  check('arcade ids match the hub medal strips', (() => { const HM = require('../hub/medals.js'); return Object.keys(A).every((g) => JSON.stringify(A[g].map((m) => m.id)) === JSON.stringify(HM.GAMES[g].medals.map((x) => x[0]))); })());
  let r = Prof.syncGame(Prof.defaults(), 'stack', ['round1', 'f15', 'bogus', 'f15']);
  check('arcade sync reports known ids once and lights bronze + silver', JSON.stringify(r.added) === '["round1","f15"]' && r.profile.nodes['w5-stack'].medals.b && r.profile.nodes['w5-stack'].medals.s && !r.profile.nodes['w5-stack'].medals.g && r.profile.tokens === 20, JSON.stringify(r.profile.nodes['w5-stack']));
  check('arcade progress never clears the W0 cross-game goals (all 6 games keeps its meaning)', !r.profile.nodes['w0-first'] && !r.profile.nodes['w0-practice'] && Prof.DERIVED.find((d) => d.node === 'w0-practice').test(6) && !Prof.DERIVED.find((d) => d.node === 'w0-practice').test(5));
  r = Prof.syncGame(r.profile, 'stack', ['round1', 'f15', 'f40']);
  check('re-sync adds only the new id (gold), Tokens once', JSON.stringify(r.added) === '["f40"]' && r.profile.nodes['w5-stack'].medals.g && r.profile.tokens === 30);
  const hostileA = Prof.syncGame({ games: { echo: { done: ['t10', '<img>', {}] } } }, 'echo', ['t10', 'round1']);
  check('arcade: stored done ids are not re-reported; hostile entries dropped', JSON.stringify(hostileA.added) === '["round1"]' && JSON.stringify(hostileA.profile.games.echo.done) === '["t10","round1"]');
  const gl = Prof.goalsFor(r.profile, 'w5-stack');
  check('goalsFor lists the four arcade goals with done flags', gl.length === 4 && gl.every((x) => x.game === 'stack') && gl.filter((x) => x.done).length === 3);
  check('six-game milestones unchanged by the arcade group', Object.keys(Prof.MILESTONES).join(',') === 'jam,bugs,stalk,angler,deepdelve,lantern');
}

// ---- map validation
check('shipped map validates', M.validate(M.MAP).ok, JSON.stringify(M.validate(M.MAP).errors));
check('shipped map has worlds W0..W7', ['w0', 'w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7'].every((w) => M.MAP.nodes.some((n) => n.world === w)));
{
  const c = (f) => { const m = JSON.parse(JSON.stringify(M.MAP)); f(m); return M.validate(m); };
  check('duplicate node id fails', !c((m) => m.nodes.push(Object.assign({}, m.nodes[0]))).ok);
  check('path to missing node fails', !c((m) => m.paths.push({ id: 'bad', from: 'w0-square', to: 'nope', unlock: null })).ok);
  check('unreachable island node fails', !c((m) => m.nodes.push({ id: 'w9-lost', type: 'level', x: 1, y: 1, world: 'w9', medals: 3 })).ok);
  check('duplicate path id fails', !c((m) => m.paths.push(Object.assign({}, m.paths[0]))).ok);
}

// ---- bfs
{
  const mini = { start: 'a', nodes: ['a', 'b', 'c', 'd'].map((id) => ({ id })), paths: [
    { id: 'a>b', from: 'a', to: 'b' }, { id: 'b>d', from: 'b', to: 'd' }, { id: 'a>c', from: 'a', to: 'c' },
    { id: 'c>x', from: 'c', to: 'd' }, { id: 'a>d', from: 'a', to: 'd' }] };
  check('bfs finds the shortest path', JSON.stringify(M.bfs(mini, 'a', 'd', ['a>b', 'b>d', 'a>c', 'c>x', 'a>d'])) === '["a","d"]');
  check('bfs ignores a locked path (takes the longer route)', JSON.stringify(M.bfs(mini, 'a', 'd', ['a>b', 'b>d', 'a>c'])) === '["a","b","d"]');
  check('bfs returns null when every route is locked', M.bfs(mini, 'a', 'd', []) === null);
  check('bfs same node and unknown node', JSON.stringify(M.bfs(mini, 'a', 'a', [])) === '["a"]' && M.bfs(mini, 'a', 'zz') === null);
  const fresh = M.sanitizeState({});
  check('locked shipped route is unreachable at start', M.bfs(M.MAP, 'w0-square', 'w2-lantern', M.openPathIds(M.MAP, fresh)) === null);
}

// ---- unlock: normal vs secret, no replay
{
  let s = M.sanitizeState(null);
  let r = M.unlock(M.MAP, s, { node: 'w1-turnip', exit: 'normal' });
  check('normal exit reveals nothing on the secret path', !r.revealed.includes('w1-turnip>w1-castle'));
  r = M.unlock(M.MAP, M.sanitizeState(null), { node: 'w1-turnip', exit: 'secret' });
  check('secret exit reveals only the secret path', JSON.stringify(r.revealed) === '["w1-turnip>w1-castle"]', JSON.stringify(r.revealed));
  check('secret exit with reward grants a key', r.state.keys === 1);
  let w = M.unlock(M.MAP, M.sanitizeState(null), { node: 'w1-weed', exit: 'normal' });
  check('normal exit reveals the normal path', JSON.stringify(w.revealed) === '["w1-weed>w1-turnip"]');
  const reload = M.unlock(M.MAP, JSON.parse(JSON.stringify(w.state)), { node: 'w1-weed', exit: 'normal' });
  check('no replay of a revealed path after reload', reload.revealed.length === 0);
  check('input state not mutated', JSON.stringify(s) === JSON.stringify(M.sanitizeState(null)));
}

// ---- keys, medal gate, completion
{
  let s = M.unlock(M.MAP, M.sanitizeState(null), { node: 'w1-turnip', exit: 'secret' }).state;
  const k = M.useKey(M.MAP, s, 'lock-w1-a');
  check('key opens the lock path once', k.ok && M.openPathIds(M.MAP, k.state).includes('w1-museum>w1-bonus') && !M.useKey(M.MAP, k.state, 'lock-w1-a').ok);
}
{
  const gate = 'w2-keep>w3-deepdelve';
  const mk = (n) => { const nodes = {}; for (let i = 0; i < n; i++) nodes['w2-x' + i] = { medals: { b: true, s: false, g: false }, exits: [] }; return { nodes }; };
  check('7 medals keep W3 closed', !M.medalGate(mk(7), 8) && !M.openPathIds(M.MAP, mk(7)).includes(gate));
  check('medal gate of 8 opens W3', M.medalGate(mk(8), 8) && M.openPathIds(M.MAP, mk(8)).includes(gate));
  const t = M.totals(M.MAP);
  check('completion 0% on empty state', M.completion({}) === 0);
  const full = { nodes: {}, comets: [] };
  M.MAP.nodes.forEach((n) => { full.nodes[n.id] = { medals: { b: true, s: true, g: true }, exits: ['normal', 'secret'] }; if (n.comet) full.comets.push(n.id); });
  check('completion 100% when everything is done', M.completion(full) === 100);
  const one = { nodes: { 'w2-keep': { medals: { b: true, s: true, g: false }, exits: [] }, 'w2-burrow': { medals: { b: false, s: false, g: false }, exits: ['secret'] } } };
  check('completion percent math exact', M.completion(one) === Math.round(3 * 1000 / t.total) / 10, String(M.completion(one)));
}

// ---- sanitiser
{
  const g = M.sanitizeState({ nodes: { a: 5, b: { medals: 'x', exits: [1, 'normal'] } }, seenPaths: 'q', keys: 'abc', keysUsed: [null, 'k'], comets: {} });
  check('state sanitiser handles garbage', g.keys === 0 && g.seenPaths.length === 0 && g.nodes.b.exits.length === 1 && g.nodes.a.exits.length === 0 && g.keysUsed[0] === 'k');
  check('sanitiser survives non-objects', M.sanitizeState(42).keys === 0 && M.sanitizeState([]).comets.length === 0 && M.medalCount('zz') === 0);
}
done();
