// Cross-feature checks: landmarks must not shadow each other, overlays must
// behave (one at a time, Esc closes), labels must not pile up on each other.
const { launch, scene, check, done } = require('./helpers');

(async () => {
  const { browser, page, errors } = await launch({ width: 1000, height: 700 }, { crafted: { plank: 2 }, villagerAffinity: { mocha: 60 } });

  // 1. Standing at each interactive landmark opens ITS overlay (nothing earlier shadows it).
  const spots = await scene(page, (s) => ({
    workbench: [WORKBENCH_POS.x, WORKBENCH_POS.y + 30, 'workbenchOpen'],
    mailbox: [MAILBOX_POS.x, MAILBOX_POS.y + 30, 'mailboxOpen'],
    home: [HOME_POS.x, HOME_POS.y + 60, 'homeOpen'],
    guestbook: [GUESTBOOK_POS.x, GUESTBOOK_POS.y + 20, 'guestbookOpen'],
  }));
  for (const [name, [x, y, flag]] of Object.entries(spots)) {
    const r = await scene(page, (s, a) => {
      ['workbenchOpen', 'mailboxOpen', 'homeOpen', 'guestbookOpen'].forEach((f) => { if (s[f]) s.closeTopOverlay(); });
      s.localBody.setPosition(a.x, a.y); s.interact();
      const opened = !!s[a.flag]; s.closeTopOverlay();
      return { opened, closedByEsc: !s[a.flag] };
    }, { x, y, flag });
    check(`landmark ${name}: interact opens it, Esc/close works`, r.opened && r.closedByEsc, JSON.stringify(r));
  }

  // 2. Overlays are mutually exclusive in practice: canAct() is false while one is open,
  //    so a second interact() cannot stack another overlay.
  const stack = await scene(page, (s) => {
    s.localBody.setPosition(WORKBENCH_POS.x, WORKBENCH_POS.y + 30); s.interact();
    const first = !!s.workbenchOpen; const blocked = s.canAct() === false;
    s.closeTopOverlay();
    return { first, blocked, open: ['workbenchOpen', 'mailboxOpen', 'homeOpen', 'guestbookOpen'].filter((f) => s[f]) };
  });
  check('overlays: canAct blocks stacking while one is open', stack.first && stack.blocked && stack.open.length === 0, JSON.stringify(stack));

  // 3. Landmarks keep their distance: no two new interactables closer than their radii would allow.
  const dist = await scene(page, (s) => {
    const pts = { WORKBENCH: [WORKBENCH_POS, WORKBENCH_RADIUS], MAILBOX: [MAILBOX_POS, MAILBOX_RADIUS], HOME: [HOME_POS, HOME_RADIUS], GUESTBOOK: [GUESTBOOK_POS, GUESTBOOK_RADIUS], BUGOFF: [BUGOFF_SIGN_POS, 0], TOURNEY: [FISH_TOURNAMENT_SIGN_POS, 0], SHOP: [{ x: HOME_POS.x - 600, y: 800 }, 0] };
    const names = ['WORKBENCH', 'MAILBOX', 'HOME', 'GUESTBOOK']; const bad = [];
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
      const [a, ra] = pts[names[i]]; const [b, rb] = pts[names[j]];
      if (Math.hypot(a.x - b.x, a.y - b.y) < ra + rb) bad.push([names[i], names[j]]);
    }
    return bad;
  });
  check('radii: no two interactive landmarks overlap', dist.length === 0, JSON.stringify(dist));

  // 4. Every nearby weed is reachable (not shadowed) except the intentionally-earlier branches.
  const weeds = await scene(page, (s) => {
    let pulled = 0; const total = s.weedSpots.length; const stuck = [];
    s.weedSpots.forEach((w, i) => {
      s.localBody.setPosition(w.x, w.y); s.interact();
      if (s.weedsPulledToday.has(i)) pulled++; else stuck.push(i);
    });
    return { pulled, total, stuck };
  });
  check('weeds: every weed can actually be pulled (none shadowed by landmarks)', weeds.pulled === weeds.total, JSON.stringify(weeds));

  // 5. Static decor does not collide: every landmark is outside every static obstacle (except its own).
  const inside = await scene(page, (s) => {
    const own = { workbench: WORKBENCH_POS, mailbox: MAILBOX_POS, home: HOME_POS };
    const bad = [];
    for (const [name, p] of Object.entries({ ...own })) {
      // The player must be able to stand within the interact radius: find a free point within 60px.
      let ok = false;
      for (let a = 0; a < 16 && !ok; a++) {
        const x = p.x + Math.cos(a / 16 * 6.283) * 60; const y = p.y + Math.sin(a / 16 * 6.283) * 60;
        ok = !s.obstacles.getChildren().some((r) => Math.abs(x - r.x) < r.width / 2 + 8 && Math.abs(y - r.y) < r.height / 2 + 8);
      }
      if (!ok) bad.push(name);
    }
    return bad;
  });
  check('landmarks: a free standing spot exists beside each', inside.length === 0, JSON.stringify(inside));

  // 6. World labels do not stack: no two label texts at (nearly) the same screen position.
  const labels = await scene(page, (s) => {
    const texts = s.children.list.filter((c) => c.type === 'Text' && c.text && /Mailbox|Workbench|Home|BUG-OFF|FISH TOURNEY|Guestbook|Museum|Shop/.test(c.text) && c.visible);
    const bad = [];
    for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i]; const b = texts[j];
      if (Math.abs(a.x - b.x) < Math.min(a.width, b.width) * 0.6 && Math.abs(a.y - b.y) < 14) bad.push([a.text.slice(0, 14), b.text.slice(0, 14)]);
    }
    return { n: texts.length, bad };
  });
  check('labels: no two world labels overlap', labels.bad.length === 0, JSON.stringify(labels));

  check('no console errors', errors.length === 0, errors.join('|'));
  console.log('fps', await page.evaluate(() => window.__g.loop.actualFps));
  await browser.close();
  done();
})();
