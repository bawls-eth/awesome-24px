// Soak: ~45s of scripted play across every feature. Checks no errors, no
// runaway object/tween/timer growth (leaks), and that fps stays sane.
const { launch, scene, check, done } = require('./helpers');

(async () => {
  const { browser, page, errors } = await launch({ width: 1000, height: 700 }, { resources: { wood: 30, stone: 30, fish: 9, bugs: 9, fruit: 9, shells: 9, flowers: 9 }, villagerAffinity: { mocha: 60 } });
  const snap = () => scene(page, (s) => ({ objs: s.children.list.length, tweens: s.tweens.getTweens().length, timers: s.time._active.length, chat: document.querySelectorAll('#chat-log > *, #chat-messages > *').length, fps: window.__g.loop.actualFps }));
  const before = await snap();
  for (let round = 0; round < 15; round++) {
    await scene(page, (s, r) => {
      const stops = [[WORKBENCH_POS.x, WORKBENCH_POS.y + 30], [MAILBOX_POS.x, MAILBOX_POS.y + 30], [HOME_POS.x, HOME_POS.y + 60], [GUESTBOOK_POS.x, GUESTBOOK_POS.y + 20], [1200, 600], [400, 450]];
      const [x, y] = stops[r % stops.length];
      s.localBody.setPosition(x, y); s.interact();
      if (s.workbenchOpen) { RECIPES.forEach((rc) => s.craftRecipe(rc.id)); s.closeWorkbench(); }
      if (s.mailboxOpen) { s.collectAllLetters(); s.closeMailbox(); }
      if (s.homeOpen) { s.setHomeSlot(r % 6, 'plank'); s.setHomeSlot(r % 6, null); s.closeHome(); }
      if (s.guestbookOpen) s.closeGuestbook();
      s.isBugOffTime = () => r % 2 === 0; s.refreshBugOff();
      const bug = s.bugs.find((b) => b.alive); if (bug) s.catchBug(bug);
      s.weedSpots.slice(0, 3).forEach((w, i) => { s.localBody.setPosition(w.x, w.y); s.interact(); });
      s.refreshWeeds(); s.refreshMailboxLabel(); s.refreshBirthdays();
    }, round);
    await page.waitForTimeout(2500);
  }
  const after = await snap();
  console.log(JSON.stringify({ before, after }));
  check('soak: display objects do not grow unboundedly (<= +40)', after.objs - before.objs <= 40, `${before.objs}->${after.objs}`);
  check('soak: tweens do not leak (<= +40)', after.tweens - before.tweens <= 40, `${before.tweens}->${after.tweens}`);
  check('soak: timers do not leak (<= +20)', after.timers - before.timers <= 20, `${before.timers}->${after.timers}`);
  // Headless software rendering makes absolute fps noisy (it swings 26-55 on an idle
  // page between runs), so this is only a gross-regression guard, not a budget.
  check('soak: fps stays above 15 (gross-regression guard)', after.fps > 15, String(after.fps));
  // Per-frame logic cost: update() must stay tiny (measured ~0.015 ms).
  const upd = await scene(page, (s) => { const t = performance.now(); for (let i = 0; i < 300; i++) s.update(performance.now(), 16); return (performance.now() - t) / 300; });
  check('soak: update() costs < 1 ms per frame', upd < 1, String(upd));
  check('soak: no console errors', errors.length === 0, errors.join('|'));
  await browser.close();
  done();
})();
