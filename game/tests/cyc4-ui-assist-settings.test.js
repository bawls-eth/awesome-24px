// Cycle 4 U, ID-06 assist UI (spec: design/beta/cycle2-ui.md "ID-06 Assist sliders"; logic is S's, cyc4-systems).
// The shared Settings sheet (shared/mm-settings.js) gets two step controls in the Play group under an "Assist" sub-heading:
//   - "Damage taken" 100 / 90 / 80 / 70 / 60 / 50 % (6 steps) and "Aim help" Off / Light / Medium / Strong.
//   - each is a role=radiogroup labelled by its visible label, which carries the value text ("Damage taken: 80%"); steps are
//     role=radio buttons >= 44x44 px; ONE Tab stop per group (roving tabindex), arrows / Home / End move and select, touch / click
//     selects; a polite live region says the new value; "Reset assist" shows only when a value is not default.
//   - device key mm-assist = JSON {dmg, aim} (never the save); hostile values read as defaults.
//   - MMSettings.assistTag() makes the "Assisted" tag (text, >= 12 px, outlined) for run summaries.
// Fixture page, blockDb (no network at all). Desktop 1280x720 and phone 390x844 (touch) and 195x422 (200% zoom).
// Run: python3 -m http.server 8440 &   BASE=http://localhost:8440/game/index.html NODE_PATH=$(npm root -g) node game/tests/cyc4-ui-assist-settings.test.js
const { chromium } = require('playwright');
const { check, done, blockDb } = require('./helpers');
const ORIGIN = (process.env.BASE || 'http://localhost:8440/game/index.html').replace(/\/game\/index\.html.*$/, '');
const PAGE = ORIGIN + '/game/tests/fixtures/settings-fixture.html';

// node model
const S = require('../shared/mm-settings.js');
const mem = (init) => ({ d: Object.assign({}, init || {}), getItem(k) { return k in this.d ? this.d[k] : null; }, setItem(k, v) { this.d[k] = String(v); } });
{
  const m = mem();
  check('model: absent key = defaults (100 % damage, aim help off), not assisted', S.readAssist && S.readAssist(m).dmg === 100 && S.readAssist(m).aim === 0 && !S.assisted(m));
  check('model: 6 damage steps 100..50 and 4 aim steps', S.ASSIST_DMG && S.ASSIST_DMG.join() === '100,90,80,70,60,50' && S.AIM_LABEL.join() === 'Off,Light,Medium,Strong');
  const ok = S.set(m, 'assist-dmg', 70) && S.set(m, 'assist-aim', 2);
  check('model: set writes mm-assist JSON {dmg, aim} only', ok && JSON.parse(m.d['mm-assist']).dmg === 70 && JSON.parse(m.d['mm-assist']).aim === 2 && Object.keys(m.d).join() === 'mm-assist', JSON.stringify(m.d));
  check('model: off-step values are refused', !S.set(m, 'assist-dmg', 55) && !S.set(m, 'assist-aim', 9) && S.readAssist(m).dmg === 70, JSON.stringify(m.d));
  check('model: assisted() true once a value is not default', S.assisted(m));
  const h = mem({ 'mm-assist': '{"dmg":5,"aim":"x","__proto__":{"dmg":50}}' });
  check('model: hostile JSON reads as defaults', S.readAssist(h).dmg === 100 && S.readAssist(h).aim === 0);
  check('model: broken JSON reads as defaults', S.readAssist(mem({ 'mm-assist': '{' })).dmg === 100);
}

async function open(browser, vp) {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: vp.w, height: vp.h } }, vp.touch ? { hasTouch: true, isMobile: true } : {}));
  const db = await blockDb(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => { if (!sessionStorage.s) { sessionStorage.s = 1; localStorage.clear(); } });
  await page.goto(PAGE);
  await page.waitForFunction(() => window.__set && document.getElementById('mmset'));
  return { ctx, page, errors, db };
}
const state = (page) => page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const grp = (id) => {
    const w = q('#mmset-' + id); if (!w) return null;
    const rg = w.querySelector('[role=radiogroup]');
    const lab = rg && document.getElementById(rg.getAttribute('aria-labelledby'));
    const radios = rg ? [...rg.querySelectorAll('[role=radio]')] : [];
    return {
      label: lab ? lab.textContent.replace(/\s+/g, ' ').trim() : '',
      n: radios.length,
      checked: radios.filter((r) => r.getAttribute('aria-checked') === 'true').map((r) => r.dataset.value),
      tabStops: radios.filter((r) => r.tabIndex === 0).length,
      minW: Math.min(...radios.map((r) => r.getBoundingClientRect().width)), minH: Math.min(...radios.map((r) => r.getBoundingClientRect().height)),
      inView: radios.every((r) => { const b = r.getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth + 0.5; })
    };
  };
  const play = q('#mmset [data-group="play"]');
  return {
    dmg: grp('assist-dmg'), aim: grp('assist-aim'),
    inPlay: !!(play && play.contains(q('#mmset-assist-dmg')) && play.contains(q('#mmset-assist-aim'))),
    groups: [...document.querySelectorAll('#mmset .mmset-gh')].map((h) => h.textContent).join(),
    reset: !!(q('#mmset-assist-reset') && !q('#mmset-assist-reset').hidden && q('#mmset-assist-reset').getClientRects().length),
    live: (q('#mmset-assist-live') || {}).textContent || '', liveRole: q('#mmset-assist-live') && q('#mmset-assist-live').getAttribute('aria-live'),
    key: localStorage.getItem('mm-assist'), focus: document.activeElement && (document.activeElement.dataset.value || document.activeElement.id),
    focusRing: document.activeElement ? getComputedStyle(document.activeElement).outlineStyle : ''
  };
});

(async () => {
  const browser = await chromium.launch();
  for (const vp of [{ id: '1280x720', w: 1280, h: 720 }, { id: '390x844', w: 390, h: 844, touch: true }, { id: '195x422', w: 195, h: 422, touch: true }]) {
    const L = `[${vp.id}]`;
    const { ctx, page, errors, db } = await open(browser, vp);
    await page.click('#open');
    await page.waitForTimeout(150);
    let s = await state(page);
    check(`${L} Assist controls exist inside the Play group; the four groups are unchanged`, s.inPlay && s.groups === 'Play,See,Hear,Help', JSON.stringify(s));
    check(`${L} Damage taken: 6 radio steps, label shows the value ("Damage taken: 100%"), one checked`, s.dmg && s.dmg.n === 6 && s.dmg.label === 'Damage taken: 100%' && s.dmg.checked.join() === '100', JSON.stringify(s.dmg));
    check(`${L} Aim help: 4 radio steps, label "Aim help: Off"`, s.aim && s.aim.n === 4 && s.aim.label === 'Aim help: Off' && s.aim.checked.join() === '0', JSON.stringify(s.aim));
    check(`${L} every step is >= 44x44 px and inside the screen`, s.dmg && s.aim && s.dmg.minW >= 44 && s.dmg.minH >= 44 && s.aim.minW >= 44 && s.aim.minH >= 44 && s.dmg.inView && s.aim.inView, JSON.stringify([s.dmg, s.aim]));
    check(`${L} one Tab stop per group (roving tabindex); Reset hidden at defaults`, s.dmg && s.dmg.tabStops === 1 && s.aim.tabStops === 1 && !s.reset, JSON.stringify(s));
    if (vp.touch) {
      await page.tap('#mmset-assist-dmg [data-value="60"]');
    } else {
      // keyboard: Tab from Close until the damage group's checked step has focus, then arrows / End / Home
      let hops = 0;
      while (hops++ < 30 && !(await page.evaluate(() => document.activeElement && document.activeElement.closest && !!document.activeElement.closest('#mmset-assist-dmg')))) await page.keyboard.press('Tab');
      s = await state(page);
      check(`${L} Tab reaches the damage group on its checked step, with a visible focus ring`, s.focus === '100' && s.focusRing !== 'none', JSON.stringify({ hops, f: s.focus, r: s.focusRing }));
      await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
    }
    s = await state(page);
    check(`${L} choosing 60 % updates the label, the checked step, the key and the live region`, s.dmg.label === 'Damage taken: 60%' && s.dmg.checked.join() === '60' && JSON.parse(s.key || '{}').dmg === 60 && /Damage taken 60 percent/.test(s.live) && s.liveRole === 'polite', JSON.stringify(s));
    check(`${L} Reset assist appears once a value is not default`, s.reset, JSON.stringify(s));
    if (!vp.touch) {
      check(`${L} focus follows the arrows (on 60)`, s.focus === '60', s.focus);
      await page.keyboard.press('End');
      s = await state(page);
      check(`${L} End jumps to 50 %`, s.dmg.checked.join() === '50' && s.focus === '50', JSON.stringify(s.dmg));
      await page.keyboard.press('Home');
      await page.keyboard.press('Tab');
      s = await state(page);
      check(`${L} Home goes back to 100 %, then ONE Tab leaves the group for Aim help`, s.dmg.checked.join() === '100' && s.focus === '0', JSON.stringify(s));
      await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
      s = await state(page);
      check(`${L} arrows set Aim help to Medium`, s.aim.label === 'Aim help: Medium' && JSON.parse(s.key).aim === 2, JSON.stringify(s));
      const hot = await page.evaluate(() => window.__hot);
      check(`${L} arrow keys inside the sheet never reach page hotkeys`, hot === 0, String(hot));
      await page.click('#mmset-assist-reset');
      s = await state(page);
      check(`${L} Reset assist puts both back to default and hides itself, focus stays in the sheet`, s.dmg.checked.join() === '100' && s.aim.checked.join() === '0' && !s.reset && s.focus === '100', JSON.stringify(s));
      await page.keyboard.press('Escape');
      const f = await page.evaluate(() => ({ open: window.__set.isOpen(), f: document.activeElement && document.activeElement.id }));
      check(`${L} Esc closes the sheet and returns focus to the opener`, !f.open && f.f === 'open', JSON.stringify(f));
      const tag = await page.evaluate(() => {
        localStorage.setItem('mm-assist', JSON.stringify({ dmg: 70, aim: 1 }));
        const t = MMSettings.assistTag(document); document.body.appendChild(t);
        const cs = getComputedStyle(t);
        return { text: t.textContent, title: t.title, fs: parseFloat(cs.fontSize), border: cs.borderTopStyle, bw: parseFloat(cs.borderTopWidth), assisted: MMSettings.assisted(localStorage) };
      });
      check(`${L} assistTag(): "Assisted" text, >= 12 px, outlined, title says what was used`, tag.text === 'Assisted' && tag.fs >= 12 && tag.border === 'solid' && tag.bw >= 2 && /damage taken 70 percent, aim help Light/.test(tag.title) && tag.assisted, JSON.stringify(tag));
    }
    if (vp.id === '390x844') {
      await page.evaluate(() => document.getElementById('mmset-assist-h').scrollIntoView({ block: 'start' }));
      await page.waitForTimeout(100);
      await page.screenshot({ path: __dirname + '/../design/beta/img/cyc4-ui-assist-after.jpg', type: 'jpeg', quality: 70 });
    }
    check(`${L} no page errors, no network`, errors.length === 0 && db.attempts() === 0, errors.join(' | '));
    await ctx.close();
  }
  await browser.close();
  done();
})();
