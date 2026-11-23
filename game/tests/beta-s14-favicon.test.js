// Beta S-14 (b15, P3): the Arcane Frontier page declares a favicon that exists (no /favicon.ico 404 on that page).
// Node only. Run: node game/tests/beta-s14-favicon.test.js
const fs = require('fs');
const path = require('path');
const { check, done } = require('./helpers');
const page = path.join(__dirname, '..', 'games', 'arcane-frontier', 'index.html');
const html = fs.readFileSync(page, 'utf8');
const head = (html.match(/<head>([\s\S]*?)<\/head>/) || ['', ''])[1];
const m = head.match(/<link\s+rel="icon"[^>]*href="([^"]+)"/);
check('arcane-frontier/index.html has a <link rel="icon"> in <head>', !!m);
const target = m ? path.resolve(path.dirname(page), m[1]) : '';
check('the favicon href points at a file that exists', !!m && fs.existsSync(target), target);
check('the favicon is a real PNG (signature)', !!m && fs.existsSync(target) && fs.readFileSync(target).slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])));
check('it is the shared Pixeltown favicon (same file the Town uses)', !!m && path.basename(target) === 'favicon-32.png' && /icons\/favicon-32\.png/.test(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8')));
done();
