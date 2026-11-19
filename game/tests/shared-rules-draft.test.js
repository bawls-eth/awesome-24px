// Tests for game/firebase-rules.draft.json via shared/rules-check.js (RulesCheck). Run: node game/tests/shared-rules-draft.test.js
const fs = require('fs');
const path = require('path');
const RC = require('../shared/rules-check.js');
const rules = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'firebase-rules.draft.json'), 'utf8'));
let failed = 0;
function check(name, cond, extra = '') { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' ' + extra)); if (!cond) failed++; }
const done = () => { console.log(failed ? `${failed} FAILED` : 'ALL PASSED'); process.exitCode = failed ? 1 : 0; };
const ok = (p, v) => RC.check(rules, p, v).ok;
const R = (p, v) => JSON.stringify(RC.check(rules, p, v));
const ID = 'abcDEF123_-xyz789012';
const PK = '-NpartyKey12345';
const T = 1760000000000;

// ---- real shapes: must PASS
const player = { name: 'Ben', species: 'doge', frame: 3, x: 1200, y: 600, facing: 'down', score: 0, emoteAt: 0, t: T };
check('player record passes', ok('players/' + ID, player), R('players/' + ID, player));
check('player position child write passes', ok(`players/${ID}/x`, 1500));
check('chat message passes', ok('chat/-Nabc123', { id: ID, name: 'Ben', text: 'hello town', t: T }));
check('guestbook note passes', ok('guestbook/-Nabc123', { id: ID, name: 'Ben', text: 'nice place', t: T }));
check('block passes', ok('blocks/-120_340', { x: -120, y: 340, type: 'wood', ownerId: ID, t: T }));
check('realm invite passes', ok(`realmInvites/${ID}/-Npush`, { party: PK, from: ID, fromName: 'Ben', mode: '2v2', t: T }));
const m = { host: ID, hostName: 'Ben', mode: '2v2', cap: 3, t: T, guest: 'guestid_12345678', guest2: 'guestid_22345678' };
check('realm party m node passes', ok(`realmParties/${PK}/m`, m), R(`realmParties/${PK}/m`, m));
const inMsg = { k: 'in', n: 12, x: 400, y: 300, aim: 1.57, f: 1, hp: 80, mh: 100, dm: 12, rt: 6, lv: 4, nm: 'Ben', sh: 0, ab: [{ q: 1, k: 2 }] };
check('seat input message passes', ok(`realmParties/${PK}/g2`, inMsg), R(`realmParties/${PK}/g2`, inMsg));
check('bye message passes', ok(`realmParties/${PK}/g1`, { k: 'bye' }));
const snap = { k: 's', n: 5, nm: 'Ben', t: 12.3, st: 'play', w: 2, b: 'meadow', pl: [[10.5, 20, 90, 100, 0, 1.2, 0, 0], null, [5, 6, 80, 100, 0, 0, 0, 0]], en: [[0, 1, 100, 120, 40.5, 50, 0, 0]], bg: [], hz: [[10, 10, 0]], dr: [[0, 5, 5, 1]], ev: [{ q: 3, k: 'hit', d: 4, o: 1 }], ns: ['Ben', 'Ann'], du: [0, 1, 2, 1] };
check('host snapshot passes', ok(`realmParties/${PK}/h`, snap), R(`realmParties/${PK}/h`, snap));
check('walkie clip passes', ok(`walkie/${ID}/-Nw1`, { from: ID, fromName: 'Ben', data: 'AAAA'.repeat(1000), mime: 'audio/webm', t: T }));
check('scavenger claim and tournament record pass', ok('scavenger/2026-11-19', { id: ID, name: 'Ben', t: T }) && ok('tournament/2026-11-19', { id: ID, name: 'Ben', size: 42, t: T }));
check('playerCount passes', ok('playerCount', 7));
check('removing a node (null) passes', ok('chat/-Nabc123', null));

// ---- hostile: must FAIL
check('oversized player name fails', !ok('players/' + ID, { ...player, name: 'x'.repeat(200) }));
check('wrong type (x string) fails', !ok('players/' + ID, { ...player, x: '12' }));
check('extra key on player fails', !ok('players/' + ID, { ...player, isAdmin: true }));
check('out-of-range x fails', !ok('players/' + ID, { ...player, x: 9999999 }));
check('missing required child fails', !ok('players/' + ID, { name: 'Ben' }));
check('chat text 5000 chars fails', !ok('chat/-Nabc123', { id: ID, name: 'Ben', text: 'y'.repeat(5000), t: T }));
check('unknown top-level path fails', !ok('secrets/x', { a: 1 }) && !ok('admin', true));
check('30 KB guest message fails', !ok(`realmParties/${PK}/g1`, { ...inMsg, nm: 'z'.repeat(30000) }));
check('extra key on seat message fails', !ok(`realmParties/${PK}/g1`, { ...inMsg, god: 1 }));
check('4th seat g4 fails', !ok(`realmParties/${PK}/g4`, inMsg));
check('bad invite mode fails', !ok(`realmInvites/${ID}/-Np`, { party: PK, from: ID, fromName: 'B', mode: 'raid', t: T }));
check('bad party m cap fails', !ok(`realmParties/${PK}/m`, { ...m, cap: 99 }));
check('huge snapshot name fails', !ok(`realmParties/${PK}/h`, { ...snap, nm: 'n'.repeat(5000) }));
check('snapshot array too long fails', !ok(`realmParties/${PK}/h`, { ...snap, en: Array.from({ length: 1000 }, () => [1, 2]) }));
check('walkie over 200 KB fails', !ok(`walkie/${ID}/-Nw1`, { from: ID, data: 'A'.repeat(300000), mime: 'audio/webm', t: T }));
check('bad party key fails', !ok('realmParties/x!', { m }));
check('negative playerCount fails', !ok('playerCount', -3));
done();
