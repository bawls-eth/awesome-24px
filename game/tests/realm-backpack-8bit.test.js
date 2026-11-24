// BP8: the Realm backpack as one clean 8-bit panel. Hero row (name / class / level + HP and XP bars), three tabs (Gear / Stats / Relics),
// the four plain stats with a one-line meaning and the +/- of the hovered or tapped item, slot badges (letter + shape, not colour alone),
// everything >= 12 px, 44 px targets and no sideways scroll on a phone. Nothing removed: shop, list, stats table, relic book stay reachable.
// Run: BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/realm-backpack-8bit.test.js
const { chromium } = require('playwright');
const { check, done } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const MAZE = ORIGIN + '/game/games/mad-maze/index.html?test=1&offline=1';
const SAVE = { realm: { level: 6, xp: 4, shards: 80, bestWave: 2, deaths: 0, items: [{ n: 1, id: 'sparkwand', r: 1 }, { n: 2, id: 'heartcharm', r: 0 }, { n: 3, id: 'sparkwand', r: 3 }], nextUid: 4, eq: { weapon: 1 } } };

async function open(browser, viewport, opts) {
  const ctx = await browser.newContext(Object.assign({ viewport }, opts || {}));
  await ctx.route('**/game/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>town</title>town' }));
  await ctx.route('**/game/hub/index.html*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>hub</title>hub' }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(ORIGIN + '/game/games/mad-maze/lantern.css');
  await page.evaluate((v) => { localStorage.clear(); localStorage.setItem('pixeltown-save-v1', v); }, JSON.stringify(SAVE));
  await page.goto(MAZE);
  await page.waitForFunction(() => window.__mm && window.__mm.arena && window.__mm.arena.state === 'play', null, { timeout: 10000 });
  await page.evaluate(() => { const a = window.__mm.arena; a.enemies.forEach((e) => { e.active = false; }); a.eBullets.forEach((b) => { b.active = false; }); a._panel('bp'); });
  return { ctx, page, errors };
}

(async () => {
  const browser = await chromium.launch();
  for (const [label, vp, opts] of [['desktop', { width: 1280, height: 800 }, {}], ['390x844', { width: 390, height: 844 }, { hasTouch: true, isMobile: true }]]) {
    const phone = label !== 'desktop';
    const { ctx, page, errors } = await open(browser, vp, opts);
    // hero row
    const top = await page.evaluate(() => { const t = document.getElementById('realm-bp-top'); return t ? { txt: t.textContent, bars: Array.from(t.querySelectorAll('[role="meter"]')).map((m) => m.getAttribute('aria-label') + ':' + m.getAttribute('aria-valuenow') + '/' + m.getAttribute('aria-valuemax')), fill: t.querySelector('.hp .px-bar > span').style.width } : null; });
    check(`[${label}] hero row shows class + level and HP / XP bars`, !!top && /Lv 6/.test(top.txt) && top.bars.length === 2 && /^HP:\d+\/\d+$/.test(top.bars[0]) && /^XP:4\/\d+$/.test(top.bars[1]) && /%$/.test(top.fill), JSON.stringify(top));
    // tabs
    const tabs = await page.evaluate(() => Array.from(document.querySelectorAll('#realm-backpack-body [role="tab"]')).map((b) => { const r = b.getBoundingClientRect(); return { t: b.textContent, sel: b.getAttribute('aria-selected'), h: r.height, w: r.width }; }));
    check(`[${label}] exactly three tabs Gear / Stats / Relics, Gear selected first`, tabs.map((t) => t.t).join('|') === 'Gear|Stats|Relics' && tabs[0].sel === 'true' && tabs[1].sel === 'false', JSON.stringify(tabs));
    check(`[${label}] tabs are 44 px targets`, tabs.every((t) => t.h >= 44 && t.w >= 44), JSON.stringify(tabs));
    // gear tab: slots grid with letter + shape badges, shop, list
    const gear = await page.evaluate(() => { const s = document.querySelector('.realm-bp-slot[data-slot="weapon"]'); const b = s && s.querySelector('.rm-bp8-badge'); return { badge: b ? b.textContent : '', shape: b ? b.className : '', clip: b ? getComputedStyle(b).clipPath : '', slotLabel: s ? s.querySelector('.sl').textContent : '', rowBadges: document.querySelectorAll('#realm-bp-list li .rm-bp8-badge').length, shop: !!document.querySelector('#realm-bp-pane-gear button[data-open-shop]'), rows: document.querySelectorAll('#realm-bp-list li[data-uid]').length }; });
    check(`[${label}] equipped slot has a rarity letter badge with a rarity shape`, gear.badge === 'U' && /\br1\b/.test(gear.shape) && gear.clip !== 'none' && gear.slotLabel === 'weapon', JSON.stringify(gear));
    check(`[${label}] every item row has a badge; shop and list stay on the Gear tab`, gear.rowBadges === 3 && gear.shop && gear.rows === 3, JSON.stringify(gear));
    // compare-on-tap (phone) / hover (desktop): the strip shows +/-
    if (phone) await page.tap('#realm-bp-list li[data-uid="3"] .rar'); else await page.hover('#realm-bp-list li[data-uid="3"] .rar');
    const cmp = await page.evaluate(() => ({ p: document.querySelector('#realm-bp-cmp4 [data-s4="power"] .dd').textContent, d: document.querySelector('#realm-bp-cmp4 [data-s4="power"] .dd').dataset.d, f: document.querySelector('#realm-bp-cmp4 .s4-for').textContent, uid: window.__mm.arena._bpDeltaUid, want: window.__mm.arena.bpDelta(3) }));
    check(`[${label}] ${phone ? 'tapping' : 'hovering'} an item shows its Power +/- (a better wand is up)`, cmp.uid === 3 && cmp.d === 'up' && cmp.p === '+' + cmp.want.power && /Wearing: /.test(cmp.f), JSON.stringify(cmp));
    // stats tab
    await page.click('#realm-bp-tab-stats');
    const st = await page.evaluate(() => { const p = document.getElementById('realm-bp-pane-stats'); return { vis: !p.hidden && p.getBoundingClientRect().height > 0, gearHidden: document.getElementById('realm-bp-pane-gear').hidden, rows: Array.from(p.querySelectorAll('.rm-bp8-stat4 .s4')).map((r) => r.querySelector('.lb').textContent + '=' + r.querySelector('.vl').textContent + '|' + r.querySelector('.mn').textContent), dd: p.querySelector('[data-s4="power"] .dd').dataset.d, toggle: !!document.getElementById('realm-bp-stats-toggle'), line: !!document.getElementById('realm-bp-stats') }; });
    check(`[${label}] Stats tab: Power / Defense / Speed / Luck, each with a plain meaning`, st.vis && st.gearHidden && st.rows.length === 4 && /^Power=\d/.test(st.rows[0]) && /^Defense=/.test(st.rows[1]) && /^Speed=/.test(st.rows[2]) && /^Luck=/.test(st.rows[3]) && st.rows.every((r) => r.split('|')[1].length > 8), JSON.stringify(st));
    // round 4 b02-08 (intentional change): a Gear-tab compare no longer lingers on the Stats tab (it read as a debuff there); the strip on Gear shows it
    check(`[${label}] Stats tab drops the Gear-tab +/- (b02-08) and keeps the full stats table toggle`, st.dd === '' && st.toggle && st.line, JSON.stringify(st));
    const dpow = await page.evaluate(() => { const a = window.__mm.arena; const s0 = a._calcStats({ eqOverride: {} }); const s1 = a._calcStats({ eqOverride: { weapon: 3 } }); return { want: Math.round((Math.round(s1.dmg * 10) / 10 - Math.round(s0.dmg * 10) / 10) * 10) / 10, got: a.bpDelta(3).power, worn: a.bpDelta(1).power }; });
    check(`[${label}] the +/- matches _calcStats; taking off the worn wand reads as a loss`, dpow.got === dpow.want && dpow.got > 0 && dpow.worn < 0, JSON.stringify(dpow));
    // relics tab
    await page.click('#realm-bp-tab-relics');
    const rl = await page.evaluate(() => { const p = document.getElementById('realm-bp-pane-relics'); return { vis: !p.hidden, h: p.querySelector('.rm-bp8-h').textContent, statsHidden: document.getElementById('realm-bp-pane-stats').hidden, kids: p.children.length }; });
    check(`[${label}] Relics tab is the one Collections page`, rl.vis && rl.h === 'Collections' && rl.statsHidden && rl.kids >= 2, JSON.stringify(rl));
    // arrow keys move between tabs
    await page.focus('#realm-bp-tab-relics'); await page.keyboard.press('ArrowRight');
    check(`[${label}] ArrowRight on the last tab wraps to Gear`, await page.evaluate(() => window.__mm.arena.bpTab() === 'gear' && document.activeElement.id === 'realm-bp-tab-gear'));
    // text size, targets, overflow (every tab)
    for (const tb of ['gear', 'stats', 'relics']) {
      await page.click('#realm-bp-tab-' + tb);
      const m = await page.evaluate(() => {
        const card = document.querySelector('#realm-backpack .realm-bp-card');
        const small = []; card.querySelectorAll('*').forEach((el) => { if (!el.getClientRects().length || el.closest('[hidden]')) return; const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim()); if (own && parseFloat(getComputedStyle(el).fontSize) < 12) small.push(el.className || el.tagName); });
        const tiny = Array.from(card.querySelectorAll('button')).filter((b) => b.getClientRects().length && !b.closest('[hidden]') && (b.getBoundingClientRect().height < 44 || b.getBoundingClientRect().width < 44)).map((b) => b.id || b.className || b.textContent);
        return { small, tiny, sw: card.scrollWidth, cw: card.clientWidth, dw: document.documentElement.scrollWidth, vw: window.innerWidth };
      });
      check(`[${label}] ${tb} tab: all text >= 12 px`, m.small.length === 0, JSON.stringify(m.small.slice(0, 6)));
      if (phone) check(`[${label}] ${tb} tab: every button is a 44 px target, no sideways scroll`, m.tiny.length === 0 && m.sw <= m.cw + 1 && m.dw <= m.vw, JSON.stringify(m));
    }
    // the backpack is a modal over the arena (the run pauses under it)
    const ov = await page.evaluate(() => { return { modal: !document.getElementById('realm-backpack').classList.contains('hidden'), paused: window.__mm.arena.paused }; });
    check(`[${label}] the backpack is an open modal and the run is paused under it`, ov.modal && ov.paused, JSON.stringify(ov));
    // equip still works from the new layout
    await page.click('#realm-bp-tab-gear');
    await page.click('#realm-bp-list button[data-act="equip"][data-uid="3"]');
    check(`[${label}] Equip still works and the hero row / badges re-render`, await page.evaluate(() => { const b = document.querySelector('.realm-bp-slot[data-slot="weapon"] .rm-bp8-badge'); return window.__mm.arena.save.eq.weapon === 3 && !!b && b.className.indexOf('r3') >= 0 && /Lv 6/.test(document.getElementById('realm-bp-top').textContent); }));
    check(`[${label}] no page errors`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  await browser.close();
  done();
})().catch((e) => { console.error(e); process.exit(1); });
