// Run: node game/tests/shared-mm-gift.test.js   (GF1: daily gift, one claim per UTC day, total days, no streaks)
const fs = require('fs'), path = require('path');
const G = require('../shared/mm-gift.js'), B = require('../shared/mm-backup.js');
let n = 0, bad = 0;
function check(name, ok) { n++; if (!ok) { bad++; console.log('FAIL ' + name); } }
function fake(init, opts) {
  const m = Object.assign({}, init || {});
  return { getItem: (k) => { if (opts && opts.throwGet) throw new Error('x'); return k in m ? m[k] : null; }, setItem: (k, v) => { if (opts && opts.throwSet) throw new Error('full'); m[k] = String(v); }, _m: m };
}
const J = JSON.stringify, K = 'pixeltown-gift-v1', D = '2026-11-21';
const b22 = new Set(JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/arcane/b22-items-relics-keys/manifest.json'), 'utf8')).assets.map((a) => a.id));

check('key and token (token art exists in b22)', G.KEY === K && G.TOKEN === 'token_star' && b22.has(G.TOKEN));
check('fresh state', J(G.fresh()) === '{"v":1,"days":0,"last":null}' && G.canClaim(G.fresh(), D));
const c1 = G.claim(G.fresh(), D);
check('first claim pays and counts 1', c1.gift && c1.gift.day === 1 && c1.state.days === 1 && c1.state.last === D && c1.gift.kind === 'shards');
check('second claim same UTC day pays nothing', G.claim(c1.state, D).gift === null && G.claim(c1.state, D).state.days === 1 && !G.canClaim(c1.state, D));
check('claim survives reload through clean and storage', (() => { const st = fake(); G.save(st, c1.state); const l = G.load(st, D); return G.claim(l, D).gift === null && l.days === 1; })());
check('next UTC day can claim again', G.canClaim(c1.state, '2026-11-22') && G.claim(c1.state, '2026-11-22').state.days === 2);
check('a missed stretch changes nothing (no streak loss, no reset)', (() => { const c = G.claim(c1.state, '2027-03-01'); return c.gift.day === 2 && c.state.days === 2; })());
check('count is total days over 40 spaced days and never resets', (() => { let s = G.fresh(); for (let i = 0; i < 40; i++) { const d = new Date(Date.UTC(2026, 0, 1 + i * 3)).toISOString().slice(0, 10); s = G.claim(s, d).state; } return s.days === 40; })());
check('shard gifts stay within 20..40', (() => { for (let d = 1; d <= 400; d++) { const g = G.giftFor(d); if (g.kind === 'shards' && (g.shards < 20 || g.shards > 40 || g.token !== null)) return false; } return true; })());
check('day 7 / 14 / 30 give the cosmetic token and no shards', [7, 14, 30].every((d) => { const g = G.giftFor(d); return g.kind === 'token' && g.token === 'token_star' && g.shards === 0 && g.milestone; }) && G.giftFor(8).kind === 'shards' && G.giftFor(29).kind === 'shards' && G.giftFor(31).kind === 'shards');
check('gifts are deterministic and not all equal', J(G.giftFor(5)) === J(G.giftFor(5)) && new Set([1, 2, 3, 4, 5, 6, 8, 9, 10, 11].map((d) => G.giftFor(d).shards)).size > 3);
check('milestone reached through real claims', (() => { let s = { v: 1, days: 6, last: '2026-01-01' }; const c = G.claim(s, '2026-01-02'); return c.gift.milestone && c.gift.day === 7; })());
check('giftFor hostile input stays in bounds', [NaN, -5, 0, 'x', null, undefined, Infinity, 1e99, {}].every((v) => { const g = G.giftFor(v); return g.day >= 1 && g.day <= G.MAX_DAYS && (g.kind === 'token' || (g.shards >= 20 && g.shards <= 40)); }));
check('invalid today -> no claim', ['nope', null, undefined, 5, {}, '2026-13-01', '2026-02-30', '2026-1-1', ''].every((t) => G.claim(G.fresh(), t).gift === null && !G.canClaim(G.fresh(), t)));
check('UTC date edge cases: leap day valid, non-leap invalid', G.canClaim(G.fresh(), '2028-02-29') && !G.canClaim(G.fresh(), '2027-02-29') && G.canClaim(G.fresh(), '2026-12-31') && G.claim({ v: 1, days: 3, last: '2026-12-31' }, '2027-01-01').state.days === 4);
check('UTC midnight rollover: 23:59:59Z and 00:00:00Z are different days', (() => { const a = new Date('2026-11-21T23:59:59Z').toISOString().slice(0, 10), b = new Date('2026-11-22T00:00:00Z').toISOString().slice(0, 10); const s = G.claim(G.fresh(), a).state; return a !== b && !G.canClaim(s, a) && G.canClaim(s, b); })());
check('future last date is ignored (days kept, claim allowed)', (() => { const s = G.clean({ days: 9, last: '2099-01-01' }, D); return s.days === 9 && s.last === null && G.claim({ days: 9, last: '2099-01-01' }, D).state.days === 10; })());
check('clean without today keeps a valid date', G.clean({ days: 2, last: '2099-01-01' }).last === '2099-01-01' && G.clean({ days: 2, last: 'garbage' }).last === null);
check('hostile days clamped', G.clean({ days: 1e99 }).days === G.MAX_DAYS && G.clean({ days: -4 }).days === 0 && G.clean({ days: 'x' }).days === 0 && G.clean({ days: NaN }).days === 0 && G.clean({ days: 3.9 }).days === 3 && G.clean({ days: Infinity }).days === 0);
check('non-object input -> fresh', [null, undefined, 5, 'str', true, [], [1]].every((v) => J(G.clean(v)) === J(G.fresh())));
check('unknown keys dropped, pollution ignored', Object.keys(G.clean(JSON.parse('{"days":2,"last":"2026-01-01","evil":1,"__proto__":{"days":50}}'))).sort().join() === 'days,last,v' && G.clean(JSON.parse('{"__proto__":{"days":50}}')).days === 0);
check('input never mutated', (() => { const i = { v: 1, days: 3, last: D, x: 1 }; const s = J(i); G.claim(i, '2026-11-22'); G.clean(i, D); G.summary(i, D); return J(i) === s; })());
check('corrupt save recovers to fresh', ['{', 'zzz', '[', '', 'null', '7', '"x"'].every((s) => J(G.load(fake({ [K]: s }), D)) === J(G.fresh())) && J(G.load(fake({ [K]: 'x'.repeat(5000) }), D)) === J(G.fresh()));
check('throwing / missing storage never throws', J(G.load(fake({}, { throwGet: true }), D)) === J(G.fresh()) && G.save(fake({}, { throwSet: true }), G.fresh()) === null && J(G.load(null, D)) === J(G.fresh()) && G.save(null, G.fresh()) === null);
check('save stores cleaned data only', (() => { const st = fake(); G.save(st, { days: 4, last: D, junk: 1 }); return st._m[K] === '{"v":1,"days":4,"last":"2026-11-21"}'; })());
check('summary: facts only, no countdown or streak fields', (() => { const s = G.summary(c1.state, D); return s.total === 1 && s.claimedToday && !s.canClaim && s.nextMilestone === 7 && !('streak' in s) && !('timer' in s) && !('countdown' in s) && !('missed' in s); })());
check('summary next milestone advances then ends', G.summary({ days: 7 }, D).nextMilestone === 14 && G.summary({ days: 14 }, D).nextMilestone === 30 && G.summary({ days: 30 }, D).nextMilestone === null);
check('claims stop at the day cap instead of overflowing', G.claim({ v: 1, days: G.MAX_DAYS, last: null }, D).gift === null);
check('backup knows the gift key and cleans it through the owner', (() => { const st = fake(); const r = B.restore(st, { format: 'pixeltown-backup', v: 2, keys: { [K]: '{"days":5,"last":"2026-01-01","x":1}' } }); return r.ok && st._m[K] === '{"v":1,"days":5,"last":"2026-01-01"}' && B.KNOWN.indexOf(K) >= 0; })());
console.log((bad ? 'FAILED ' + bad + ' of ' : 'ok ') + n + ' assertions'); process.exit(bad ? 1 : 0);
