#!/usr/bin/env node
// Read-only activity snapshot for game/design/DAILY-REPORT.md.
// GET requests only. Prints COUNTS, never names or chat text.
// Usage: node game/tools/activity-snapshot.js [--append]
const https = require('https');
const fs = require('fs');
const path = require('path');
const BASE = 'https://animalcrossing-15728-default-rtdb.firebaseio.com/';

function get(p) {
  return new Promise((resolve) => {
    https.get(BASE + p, (r) => {
      let b = '';
      r.on('data', (c) => (b += c));
      r.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { resolve(null); } });
    }).on('error', () => resolve(null));
  });
}
const n = (o) => (o && typeof o === 'object' ? Object.keys(o).length : 0);

(async () => {
  const [pc, chat, inv, players, tour] = await Promise.all([
    get('playerCount.json'),
    get('chat.json?shallow=true'),
    get('realmInvites.json?shallow=true'),
    get('players.json?shallow=true'),
    get('tournament.json?shallow=true'),
  ]);
  const stamp = new Date().toISOString().slice(0, 16) + 'Z';
  const line = `- ${stamp} activity (counts only): playerCount=${typeof pc === 'number' ? pc : n(pc)}, online players=${n(players)}, chat messages stored=${n(chat)}, open realm invites=${n(inv)}, tournament nodes=${n(tour)}`;
  console.log(line);
  if (process.argv.includes('--append')) {
    const f = path.join(__dirname, '..', 'design', 'DAILY-REPORT.md');
    if (!fs.existsSync(f)) fs.writeFileSync(f, '# Pixeltown daily report\n');
    fs.appendFileSync(f, '\n' + line + '\n');
  }
})();
