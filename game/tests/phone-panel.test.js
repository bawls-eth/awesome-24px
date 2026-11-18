// Phone layout: the "In town" panel starts collapsed, expands/scrolls, never
// overlaps the controls or chat bar, is remembered, and desktop is unchanged.
const { launch, scene, check, done } = require('./helpers');

const rect = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, vis: cs.display !== 'none' && cs.visibility !== 'hidden' }; }, sel);
const overlap = (a, b) => a && b && a.vis && b.vis && a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
const SEL = { joystick: '#joystick', actions: '#action-buttons', chat: '#chat-panel', interact: '#interact-btn', walkie: '#walkie-panel', inventory: '#inventory-panel' };

(async () => {
  // Portrait and landscape phones.
  for (const [w, h] of [[390, 844], [360, 640], [844, 390], [667, 375], [640, 360]]) {
    const tag = `${w}x${h}`;
    const { browser, page, errors } = await launch({ width: w, height: h }, null, true);
    // 1. Collapsed by default: only the chip shows; it carries the key stats.
    const c = await page.evaluate(() => { const p = document.getElementById('player-list-panel'); const t = document.getElementById('panel-toggle'); const kids = [...p.children].filter((k) => k.id !== 'panel-toggle' && getComputedStyle(k).display !== 'none').length; const r = p.getBoundingClientRect(); return { collapsed: p.classList.contains('collapsed'), visibleKids: kids, chip: t.textContent, expanded: t.getAttribute('aria-expanded'), w: r.width, h: r.height, stored: localStorage.getItem('pixeltown-panel-collapsed') }; });
    check(`${tag}: panel starts collapsed to a chip with players + trophies`, c.collapsed && c.visibleKids === 0 && /👥 \d+ · 🏆 \d+\/\d+/.test(c.chip) && c.expanded === 'false', JSON.stringify(c));
    check(`${tag}: collapsed chip is small (< 40% of the screen width, < 64px tall)`, c.w < w * 0.4 && c.h < 64, `${c.w}x${c.h}`);
    check(`${tag}: collapsed state is not persisted until the player chooses`, c.stored === null);

    // The rest of the phone HUD must not overlap itself either (collapsed state).
    const hudHits = await page.evaluate(() => {
      const ids = ['inventory-panel', 'walkie-panel', 'player-list-panel', 'chat-panel', 'joystick', 'action-buttons'];
      const r = {}; for (const id of ids) { const e = document.getElementById(id); if (!e || e.classList.contains('hidden') || getComputedStyle(e).display === 'none') continue; const b = e.getBoundingClientRect(); if (b.width) r[id] = b; }
      const hits = []; const n = Object.keys(r);
      for (let i = 0; i < n.length; i++) for (let j = i + 1; j < n.length; j++) { const a = r[n[i]]; const b = r[n[j]]; if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) hits.push([n[i], n[j]]); }
      return hits;
    });
    check(`${tag}: no two HUD pieces overlap (inventory, walkie, panel chip, chat bar, joystick, action buttons)`, hudHits.length === 0, JSON.stringify(hudHits));

    // 2. Expand on tap: every button reachable, scrolls inside itself, <= 60vh, clear of chat/controls.
    await page.click('#panel-toggle');
    await page.waitForTimeout(250);
    const e = await page.evaluate(() => {
      const p = document.getElementById('player-list-panel'); const r = p.getBoundingClientRect(); const cs = getComputedStyle(p);
      const ids = ['achievements-badge', 'map-btn', 'museum-badge', 'dailies-btn', 'journal-btn', 'settings-toggle-btn'];
      const reachable = ids.map((id) => { const el = document.getElementById(id); el.scrollIntoView({ block: 'nearest' }); const b = el.getBoundingClientRect(); const pr = p.getBoundingClientRect(); return b.width > 0 && b.top >= pr.top - 1 && b.bottom <= pr.bottom + 1; });
      p.scrollTop = 0;
      return { collapsed: p.classList.contains('collapsed'), h: r.height, vh: window.innerHeight, overflowY: cs.overflowY, scrollable: p.scrollHeight > p.clientHeight, reachable, chip: document.getElementById('panel-toggle').textContent, stored: localStorage.getItem('pixeltown-panel-collapsed'), sw: document.documentElement.scrollWidth };
    });
    check(`${tag}: tap expands; panel <= 60% of the viewport with its own vertical scroll`, !e.collapsed && e.h <= e.vh * 0.6 + 1 && e.overflowY === 'auto', JSON.stringify(e));
    check(`${tag}: Achievements, Map, Museum, Today, Journal and Settings are all reachable when expanded`, e.reachable.every(Boolean), JSON.stringify(e.reachable));
    check(`${tag}: expanded state shows a Close control and is remembered`, /Close/.test(e.chip) && e.stored === '0' && e.sw <= w, JSON.stringify([e.chip, e.stored, e.sw]));

    // 3. No overlap with joystick, action buttons, interact, chat bar (expanded, and with Settings opened).
    for (const mode of ['expanded', 'settings-open']) {
      if (mode === 'settings-open') { await page.click('#settings-toggle-btn'); await page.waitForTimeout(250); }
      const panel = await rect(page, '#player-list-panel');
      const hits = [];
      for (const [name, sel] of Object.entries(SEL)) { if (overlap(panel, await rect(page, sel))) hits.push(name); }
      check(`${tag}: ${mode} panel overlaps no joystick / action button / interact / chat bar`, hits.length === 0, JSON.stringify([hits, panel]));
      if (mode === 'settings-open') {
        const sc = await page.evaluate(() => { const p = document.getElementById('player-list-panel'); const before = p.scrollTop; p.scrollTop = p.scrollHeight; const moved = p.scrollTop > before; const last = document.getElementById('save-import-btn'); const lb = last.getBoundingClientRect(); const pb = p.getBoundingClientRect(); p.scrollTop = 0; return { scrollable: p.scrollHeight > p.clientHeight, moved, lastReachable: lb.bottom <= pb.bottom + 1, h: pb.height, vh: window.innerHeight }; });
        check(`${tag}: with Settings open the panel scrolls inside itself (<= 60vh) and the last button is reachable`, sc.scrollable && sc.moved && sc.lastReachable && sc.h <= sc.vh * 0.6 + 1, JSON.stringify(sc));
      }
    }
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/panel-${tag}-expanded.png` });
    await page.click('#settings-toggle-btn'); // close settings again

    // 4. Collapse again via the Close control; reload remembers the choice.
    await page.click('#panel-toggle');
    await page.waitForTimeout(200);
    check(`${tag}: Close collapses it again`, await page.evaluate(() => document.getElementById('player-list-panel').classList.contains('collapsed')));
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/panel-${tag}-collapsed.png` });
    await page.click('#panel-toggle'); await page.waitForTimeout(150); // expand + remember
    await page.reload();
    await page.fill('#name-input', 'ADMINtest'); await page.click('.species-tab'); await page.waitForTimeout(150); await page.click('.avatar-choice'); await page.click('#join-btn');
    await page.waitForSelector('#player-list-panel'); await page.waitForTimeout(1500);
    const remembered = await page.evaluate(() => !document.getElementById('player-list-panel').classList.contains('collapsed'));
    check(`${tag}: reload keeps the expanded choice`, remembered === true);

    // 5. Other HUD / overlays still work with the new panel: HUD chip, workbench, Today, journal at this size.
    const o = await page.evaluate(() => {
      const out = {};
      const s = window.__g.scene.getScene('Town');
      const fit = (id) => { const c = document.querySelector(`#${id} .join-card, #${id} .achievements-card`); const r = c.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth + 0.5 && r.top >= 0 && r.bottom <= window.innerHeight + 0.5; };
      s.craftedGoods.plank = 1; s.updateInventoryHUD(); out.hudChip = !document.getElementById('crafted-count').parentElement.classList.contains('hidden');
      s.openWorkbench(); out.workbench = fit('workbench-overlay'); s.closeWorkbench();
      s.openDailies(); out.dailies = fit('dailies-overlay'); s.closeDailies();
      s.openJournal(); out.journal = fit('journal-overlay'); s.closeJournal();
      return out;
    });
    check(`${tag}: HUD chip, Workbench, Today and Journal overlays still fit the screen`, o.hudChip && o.workbench && o.dailies && o.journal, JSON.stringify(o));
    check(`${tag}: no console errors`, errors.length === 0, errors.join('|'));
    await browser.close();
  }

  // 6. Desktop unchanged: no chip, full panel, same size as before, never collapsed.
  const { browser, page, errors } = await launch({ width: 1000, height: 700 });
  const d = await page.evaluate(() => { const p = document.getElementById('player-list-panel'); const t = getComputedStyle(document.getElementById('panel-toggle')); const r = p.getBoundingClientRect(); return { chipDisplay: t.display, collapsed: p.classList.contains('collapsed'), w: r.width, maxH: getComputedStyle(p).maxHeight, inline: p.style.maxHeight, buttons: ['achievements-badge', 'map-btn', 'museum-badge', 'dailies-btn', 'journal-btn', 'settings-toggle-btn'].every((id) => document.getElementById(id).getBoundingClientRect().width > 0) }; });
  check('desktop: no chip, panel never collapsed, 180px wide, 40vh cap, all buttons visible', d.chipDisplay === 'none' && !d.collapsed && Math.round(d.w) === 180 && d.maxH === '280px' && d.inline === '' && d.buttons, JSON.stringify(d));
  await page.click('#achievements-badge'); await page.waitForTimeout(200);
  check('desktop: buttons still work (Achievements opens)', await scene(page, (s) => !!s.achievementsOpen));
  check('no console errors (desktop)', errors.length === 0, errors.join('|'));
  await browser.close();
  done();
})();
