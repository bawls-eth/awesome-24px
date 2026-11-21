# Build plan: weapon styles, projectiles, buffs, ability unlocks

Planner, 2026-11-21, for the owner's class/weapon/projectile/buff/unlock request. Read with `RESEARCH-CLASSES-WEAPONS.md`.

Ground rules: free deterministic progression (no money, no loot-box randomness); nothing removed; ranger plain bolt byte-identical; `?classstats=0`/`?signature=0` keep working; duels plain; no live-DB writes; projectiles/effects/icons code-drawn (b16-b20 undelivered), `bolt_<class>`/`fx_*`/`ui_*` art used first when present.

Units: `spd` x580 px/s; `life` seconds (base 0.85 s = 493 px); `spread` total fan in radians; `rate` x7.5 shots/s.

## (a) Weapon styles: NEW `game/shared/mm-weapons.js` (pure, UMD `MMWeapons`)

### Schema (all fields optional; defaults shown)
```
{ id, family, name, shape: dot|arrow|shard|orb|star|blade|page|axe|hammer|fist|ray,
  count:1, spread:0, spd:1, life:0.85, size:1, rate:1, dmg:1 (nominal), crit:0,
  pierce:0 (0-3), bounce:0 (0-3, walls), homing:0 (turn rad/s; cone 70 deg, range 260 px),
  wave:{amp:0 px, cycles:2.75 per life, alt:false (alternate phase per bolt = helix)},
  boomerang:false (turns at life/2, returns to hero, may re-hit each enemy once),
  chain:{n:0 (0-3), range:120, falloff:0.7}, orbit:{n:0 (0-3), radius:34, period:0.9, dmg:0, rehit:0.3},
  burst:{n:1, gap:0}, lob:{radius:0, maxRange:260} (lands at aim, area hit),
  knock:0 px (never bosses), onHit:{status:null, chance:0, sec:0},
  tune:1 (0.95-1.08 situational bonus), affix:[uncommon, rare, epic] }
```
Engine bound (tested): `count * burst.n * ceil(life * 7.5 * rate) <= 40` live bolts per hero. Pool 160; 3 remembered hits per bolt.

### Normalisation (keeps the DPS test valid by construction)
`shapeIdx(s)` is the product of these factors:
- `count * burst.n * dmg * rate`
- `(1 + 0.25 pierce)`, `(1 + crit)`, `(1 + 0.12 bounce)`
- `1.15` if homing; `1.25` if boomerang
- `(1 + 0.3 * chain.n * falloff)`
- `0.95` for a single wavy bolt
- `(1 + min(0.4, lob.radius / 100))`
- `(1 + chance * V[status])`

Orbit adds `orbit.n * orbit.dmg / orbit.rehit / 7.5`.
Status values V: slowed .2, weak .15, dazed .15, armorBroken .25, curse .2, bleed .3, rooted .25, marked .1.

These weights extend today's formula (pierce 0.25, crit 1+c). S15 calibrates them.

`resolve(classId, styleId, rarity)` works like this:
- Take the class base index from its FIRE tags: `baseIdx = shots * shotDmg * (1 + .25p) * (1 + crit)`.
- Scale the style's per-bolt damage by `k = baseIdx / shapeIdx(style) * tune`.
- Add the rarity affixes (section b).
- Return a frozen spec.

`base_<class>` is generated from FIRE, read and never copied. `base_ranger` resolves to the plain bolt, and the engine keeps `firePlayerBullet` for it.

Example: ranger with `bow_triple` has shapeIdx 1.2, so k = 1.06 / 1.2 and each arrow does 0.353. Three point-blank hits give 1.06x; at range, only the centre arrow lands.

### Families
- bow: ranger
- wand: frostcaller, graveTender
- staff: warlock, druid, necromancer
- tome: herald
- blade: punk
- hammer: paladin
- axe: berserker
- fist: bruiser
- dagger: rogue
- star: shadowPaw
- pistol: trickster

### 26 alternate styles (plus 14 base styles = 40)
Format: `id: count / spread / spd / life / pierce; extras; nominal dmg; rate; tune`
```
bow_triple       3/.18/1/.75/0; arrows; .40; 1; 1.06
bow_longshot     1/0/1.25/.85/1; 616 px range; .85; .85; 1
bow_leaf         2/.06/1/.85/0; wave amp 10 alt; .55; 1; 1
wand_seeker      1/0/.85/1.0/0; homing 4.0; .85; 1; .95
wand_chain       1/0/1.1/.8/0; chain 2 (120 px, .7); .70; .9; 1
wand_frostshard  1/0/1/.85/1; onHit slowed .25 1.5 s; .80; 1; 1
staff_helix      2/0/.9/.95/1; wave amp 14 alt (RotMG staff); .50; 1; 1
staff_orb        1/0/.6/1.4/3; size 2; .60; .7; 1
staff_bloom      1/0/.8/-/0; lob r40, onHit rooted .1 .6 s; .90; .55; 1.04
tome_page        1/0/1/.8/0; burst 3 x .05 s; .40; .8; 1
tome_orbit       1/0/1/.85/0; orbit 2 (r34, .9 s, dmg .25); .70; 1; 1
tome_psalm       1/0/.8/1.0/2; wave amp 20, size 1.5; .60; .9; 1
blade_arc        3/.7/.9/.3/2; 157 px melee arc; .55; .9; 1.08
blade_riff       2/.15/1/.8/0; wave amp 8 cycles 4, onHit dazed .15 1 s; .60; 1; 1
hammer_throw     1/0/1/1.1/3; boomerang; .70; .7; 1
hammer_smite     1/0/.9/-/0; lob r48, onHit armorBroken .2 2 s; 1.0; .6; 1.04
axe_twin         2/.3/1/.9/1; boomerang; .40; .85; 1
axe_cleave       5/.9/.9/.35/0; onHit bleed .15 3 s; .25; .9; 1.08
fist_flurry      1/0/1.2/.3/0; burst 3 x .04 s, knock 6; .45; 1; 1.08
fist_shockwave   3/.5/.8/.4/1; knock 12; .45; .8; 1.05
dagger_fan       3/.3/1.15/.7/0; crit .10; .38; 1; 1.02
dagger_venom     2/.08/1.1/.8/0; crit .10, onHit bleed .25 3 s; .45; 1; 1
star_bounce      2/.2/1.1/.95/0; bounce 2, crit .10; .42; 1; 1
star_seeker      3/.5/1/.9/0; homing 3.0, crit .10; .32; 1; .95
pistol_ricochet  1/0/1.2/.85/0; bounce 3, ray; .80; 1; 1
pistol_burst     1/0/1.2/.7/0; burst 3 x .06 s; .38; .9; 1
```

### Motion kernels: NEW `game/shared/mm-projectile.js` (pure)
`step(bolt, spec, dt, world)` returns `alive | dead | bounced | returned`. The `world` argument is `{isWall, nearest(x, y, range, cone, dir)}`.

- **wave**: the bolt keeps a centreline `cx, cy` and adds a perpendicular offset `amp * min(1, age / (.25 life)) * sin(2 PI cycles age / life + ph)`.
- **homing**: the bolt turns by at most `homing * dt`.
- **boomerang**: after `life / 2` the bolt steers back to the hero and ends within 16 px.
- **bounce**: the bolt reflects its velocity on the hit axis.
- **chain**: a hit spawns a child bolt at the nearest un-hit enemy with `dmg * falloff`.
- **orbit**: driven by an orbiter pool (at most 3 per hero).
- **lob**: the bolt flies to the aim point without colliding, shows a 0.25 s telegraph ring, then does area damage.

All kernels are deterministic, and guests run the same `step`.

## (b) Class base style and equipped weapons
- `CLASS_FAMILY` maps classes to families. `styleFor(classId, item)` returns a style id, or `base`.
- **Legacy weapons** (`sparkwand`, `quickwand`): unchanged stat sticks that any class can equip. They keep the base style.
- **Styled weapons**: new `RM_ITEMS` entries `{id:'wpn_<style>', slot:'weapon', stat:'dmg', amount:0.45, style, family, icon}`.
  - Rarity multiplies as today (+0.45/+0.72/+1.08/+1.62), about 93% of a Spark Wand, so styles are sidegrades. `canEquip` needs a family match; others see it greyed with "Bow: Ranger".
- **Affixes**, fixed per style (no rolls): Common none, Uncommon `affix[0]`, Rare `[0,1]`, Epic `[0,1,2]`.
  - Ids: `reach` (life +10%), `velocity` (spd +10%), `pierce` (+1, capped at 3), `keen` (crit +.05), `venom` (onHit chance +.10, or bleed .10), `extra` (+1 count, renormalised), `seek` (homing +1).
  - Index gain capped at 1.03/1.06/1.10 (Uncommon/Rare/Epic). Example: `bow_triple: [reach, keen, extra]`.
- **Drops and shop**: drops are 70% active-family, 30% any family (existing seeded drop RNG); the shop has fixed family stock at unlocked rarities, `sell x 8`, no luck.
- **Balance test** (`shared-mm-weapons.test.js`), for every class x {base + family styles} x 4 rarities:
  - `eff = profile.dmg * profile.rate * (1 + .45 mult[r]) * shapeIdx(resolved) * affixIdx` lies within +-30% of the median of the class bases at that rarity.
  - Each resolved style lies within [0.95, 1.10] of its own base.
  - `shared-mm-class-fire.test.js` is untouched.

## (c) Buff and debuff catalogue: NEW `game/shared/mm-status.js` (pure, UMD `MMStatus`)

API:
- `apply(state, id, {sec, stacks, src}, nowMs)` returns a new state.
- `tick(state, nowMs)`.
- `mods(state)` returns `{dmg, rate, speed, taken, regen, dot, noHeal, cdRate, enemyFire, enemyDmg}`.
- `iconList(state, nowMs)` and `immune(id, targetKind)`.

Rules:
- Default stacking is take-max potency plus refresh duration.
- Opposite pairs resolve with the negative winning: weak > damaging, dazed > berserk, slowed > swift, armorBroken > armored, sick > healing.
- Caps: player dmg 0.5-1.6 (including `buffDmg` and `powMul`), player taken 0.5-1.5, speed 0.4-1.3, enemy taken at most 1.5.
- Boss tenacity: re-applying a status within 6 s of its expiry halves the duration, down to a floor of 25%.

Format: `id (+/-, on P = player / E = enemy): effect; seconds; stacking; glyph colour`
```
damaging   + P: dmg x1.25; 4; max/refresh; upward blade #ffb347
berserk    + P: rate x1.25; 4; max; double chevron #ff6a4a
swift      + P: speed x1.20; 4; max; tailed arrow #7ee7ff
armored    + P: taken x0.75; 4; max; shield #6ab8ff
healing    + P: +4 hp/s; 5; max; plus #7ee787
shielded   + P: soaks N hits (existing shield.hits); 6; max hits; ring #8fe9ff
inspired   + P: cooldowns tick x1.4; 4; max; star #ffe27a
weak       - P/E: P dmg x0.75, E bolt dmg x0.75 (via dm); 3; max; bent blade #b9b0cc
dazed      - P/E: P rate x0.6, E fire cooldowns x1.5; 2; bosses immune; spiral #d2a8ff
slowed     - P/E: speed x0.65 (E via slowT/slowF); 2; bosses x0.85; down chevron #8fb8ff
rooted     - E: speed x0.1; 1; bosses immune; knot #5fbf6a
stunned    - E: no move/fire; 0.8; then 6 s immune; bosses immune; stars #fff3c4
armorBroken- P/E: taken x1.25, guard 0, purple numbers; 3; max; cracked shield #c39bff
curse      - P/E: taken x1.10 per stack; 4; 3 stacks (x1.30), refresh; skull #a050ff
bleed      - P/E: E .5 x hero dmg/s/stack, P 2 hp/s/stack; 3; 3 stacks; droplet #ff5f6b
sick       - P: no healing; 3; max; struck plus #9acd32
marked     - E: +10% taken, homing prefers it; 3; max; crosshair #ff8fa8
```

Ported ad-hoc fields: shrine `rage` becomes `damaging` and `ward` becomes `armored` (`buffDmg`/`buffTaken` kept as aliases); Overdrive shows as berserk on the HUD (mechanics unchanged); signature slows go through `apply('slowed')` with current factors. In Picnic, player bleed never drops HP below 1.

**Enemy application**: enemy bolts gain an optional `st` field (status index plus chance). A bolt that carries a status has a coloured core, which is the telegraph.

Limits: 1 bolt-applied status per 0.5 s; none in zone 0 (Shore); Picnic halves durations.
Sources: ice_wraith/frost puffs slowed (30%, 1.5 s); tier-3 aimed (skeleton_archer, bone_knight) weak (20%, 2 s); ember_imp/cinders bleed (25%); toxic_serpent/swamp_leech sick (25%, 3 s); storm_harbinger dazed ring at 66% hp; dread_knight phase-3 armorBroken ring (3 s, 1 s red warning); void_oracle +1 curse per aimed volley; bone_colossus slam slowed; arena Gloomheart phase-3 weak ring.

**HUD** (code-drawn, NEW `shared/mm-fx-draw.js`): up to 6 player icons of 18 px above the HP bar, negatives first; dark disc, 2 px ring (gold positive, red negative), vector glyph, clockwise time pie, stack digit, blink in the last 1 s (not with reduced motion). Enemies: up to 3 pips of 5 px. Damage numbers purple for armorBroken, violet for curse. Tooltips name every status.

## (d) Ability unlock tree: NEW `game/shared/mm-unlocks.js` (pure, UMD `MMUnlocks`)
**Gate source**: gates use the arena `save.level` (account-wide, 1-20), the same value as today's `abilityUnlocked`. `forLevel(classId, level)` returns the nodes, so per-hero levels can plug in later.

**Node**: `{id:'<class>_<lv>', lv, kind:active|passive|sig|mastery, name, short (9 chars max), text, mods}`. Mod ops:
- `mul{stat: hp|rate|dmg|speed|iframes|life, v}`
- `onHit{status, chance, sec}`
- `sig{field, v}` (still clamped by `setHeroSignature`)
- `proc{on: kill|block|lowHp|sigCast|lethal, give: status|heal|cdRefund, v, icd}`
- `ab{ability, field, v}`

**Budget test**: at L19, `prod(mul dmg/rate) * prod(1 + chance V)` lies in [1.08, 1.16] for every class, with procs counted at an uptime of 0.3. Defensive caps: hp +8% at most, iframes +10% at most.

Nodes are auto-granted: no choice, reroll or currency.

**Shared actives**:
- Existing: Q Dash L1, E Nova L3, R Shield L5, F Signature L7 (these slots already exist).
- New: **Nova II** at L11 (16->20 bolts) and **Dash II** at L16 (cooldown 3->2.5 s).

**Per class** (`L4 passive | L9 passive | L14 sig+ | L19 mastery`):
```
ranger      Keen Eye: life x1.15 | Hunter's Mark: onHit marked .15 | Volley+: count 12->16, cooldown 12->10 | Wind Archer: every 4th volley +1 pierce
frostcaller Chill: onHit slowed .2 | Glacial Focus: iframes x1.05, spd x1.1 | Blizzard+: radius 150->180, slow .45->.35 | Shatter: slowed enemies take +12%
herald      Good Dog: healing 3 s at wave start or zone entry | Fetch: dmg x1.04 | Aura+: heal 30->40, plus armored 3 s | Pack Leader: sigCast gives damaging 3 s
punk        Feedback: a block gives berserk 2 s | Distortion: onHit dazed .15 | Mosh+: shield 3->4, radius 80->100 | Encore: 10 kills refund 3 s of F
bruiser     Thick Hide: hp x1.06 | Haymaker: 15% knock 20 px | Pound+: radius 130->150, stunned .8 s | Primal: below 40% hp, berserk
graveTender Grave Chill: onHit weak .15 | Soul Sip: a kill heals 2 | Siphon+: healFrac .5->.65, heal 25->35 | Mortician: weak enemies take +10%
trickster   Slippery: dash cooldown x.87 | Ray Bounce: +1 bounce | Blink+: count 5->7, decoy 1.5 s | Probe: onHit marked .12
shadowPaw   Light Step: speed x1.05 | Bleeding Stars: onHit bleed .15 | Smoke+: iframes .8->1.1, count 7->9 | Assassin: crit +.05 against bleeding enemies
rogue       Quick Hands: rate x1.04 | Venom: onHit bleed .15 | Dash+: dist 150->180, count 7->9 | Shadowmeld: after a Dash, the next 3 volleys crit
warlock     Hex: onHit curse .15 | Dark Pact: a kill heals 1 | Drain+: radius 90->110, heal 25->35 | Doom: a cursed non-boss below 10% hp dies on hit
paladin     Steadfast: iframes x1.08 | Smite: onHit armorBroken .12 | Oath+: shield 4->5, duration 6->7 | Crusader: damaging while shielded
berserker   Bloodlust: a kill gives berserk 1.5 s (icd 3 s) | Cleave: onHit bleed .15 | Slam+: powMul 1.25->1.35, radius 120->140 | Undying: a lethal hit leaves 1 hp plus 1 s iframes (icd 60 s)
druid       Bark Skin: armored inside its own Bloom | Thorns: onHit rooted .1 | Bloom+: duration 5->7, heal 15->22 | Overgrowth: Bloom ticks heal 2
necromancer Bone Chill: onHit weak .15 | Ossuary: a kill heals 2 | Bones+: count 3->4, duration 10->12 | Lich Pact: bone hits apply curse 2 s
```

The test checks for 4 nodes per class at 4/9/14/19 and that every `sig` field exists in `arenaSignature`.

## (e) Phone UI plan
- **Ability bar** (bottom-right, above the aim stick): four round 56 px Q/E/R/F buttons, 8 px apart, in the safe area (44 px minimum at 390x844). Locked shows a lock and "Lv 5"; cooldown is a radial sweep with seconds; desktop shows the key letter. Below: 4 passive pips (10 px) for L4/9/14/19.
- **Unlock toast**: top banner "Lv 9 - Hunter's Mark unlocked", 2.5 s, queued; tap opens the tooltip; the id goes into `seen` so it never repeats; reduced motion fades only.
- **Tooltip**: long-press 400 ms (hover on desktop) opens a bottom sheet of at most 40% height: name, cooldown, `text`, "Next: Lv 14 Volley+". Weapons show style, the `MMWeapons.describe(spec)` line (e.g. "3 arrows, fan 10 deg, range 435 px, wave, bleed 15%") and affixes, with wave/boomerang shown explicitly. Esc, outside tap or back closes it.
- **Hero stats panel**: `panelRows` gains groups **Weapon** (style, family, pattern, rarity, affixes), **Passives** (4 rows, ticked or "Lv N") and **Status** (effects, seconds left), each only when its data is given; existing groups unchanged.

## (f) Slices S1-S16
Serial resources (one slice each per sub-wave): RJ `game/realm.js`, RW `games/mad-maze/realm-world.js`, MM `games/mad-maze/mad-maze.js`, PG `games/mad-maze/index.html` + `mad-maze.css`.

Test conventions:
- Browser tests open `games/mad-maze/index.html?test=1&offline=1` with an ADMIN-style local profile and read `window.__mm.arena` (as `class-fire.test.js` does).
- Every new test is registered in `tests/test-tiers.json`.

### Save keys (additive, validated)
- `pixeltown-save-v1.realm.items` gains `wpn_<style>` ids in the existing `{n, id, r}` shape.
- From S8 on, `rmCleanSave` keeps unknown ids matching `/^wpn_[a-z_]{3,24}$/` as inert, unequippable items. Drops only start in S12, so stale tabs cannot erase them.
- NEW `pixeltown-arms-v1`: `{v:1, seen:[nodeId], hud:{icons:true}}`.
  - `MMUnlocks.cleanArms`: at most 64 ids matching `/^[a-z][A-Za-z0-9]{1,15}_(4|9|11|14|16|19)$/`, duplicates removed, corrupt input becomes blank.
  - On first load, nodes at or below the current level are marked seen (no toast flood).

### Wave 1: pure modules and node tests (parallel, disjoint files)
- **S1 Weapon styles** (`mm-weapons.js`, M). Test: `shared-mm-weapons.test.js`. Checks: The 40 styles are schema-valid; `resolve('ranger', 'base', 0)` is the plain bolt; Every class x style x rarity is within +-30% of the median and [.95, 1.10] of its base; The 40-bolt bound holds; `base_<class>` equals FIRE; Junk or `__proto__` input gives the base.
- **S2 Kernels** (`mm-projectile.js`, M). Test: `shared-mm-projectile.test.js`. Checks: Wave peak offset equals amp +-0.5 px with zero drift; A boomerang ends within 16 px of the hero; A bounce reflects off a wall stub; The homing turn is at most `homing * dt`; Output is deterministic.
- **S3 Status** (`mm-status.js`, M). Test: `shared-mm-status.test.js`. Checks: Weak beats damaging; Curse caps at x1.30; Boss tenacity halves a re-apply; The caps hold; Input is not mutated; An unknown id is a no-op.
- **S4 Unlocks** (`mm-unlocks.js`, S). Test: `shared-mm-unlocks.test.js`. Checks: 14 classes x 4 nodes; The L19 index is in [1.08, 1.16]; Every sig field exists; `cleanArms` rejects bad ids and caps at 64.
- **S5 Class id fixes** (`mm-profile.js`: add graveTender, trickster and shadowPaw to `CLASSES`; `mm-items.js`: `family` plus a `classKey()` casing alias; S). Tests: extend `shared-mm-profile-backup.test.js` and `shared-mm-items.test.js`. Checks: A trickster hero survives `clean`; An 11-class fixture is byte-identical; `canEquip` works with both casings.
- **S6 Panel rows** (`mm-hero-stats.js`, S). Test: extend `shared-mm-hero-stats.test.js`. Checks: The new groups appear only when their data is given; The old-row snapshot is unchanged; Hostile strings are cleaned.
- **S7 Code-drawn shapes and icons** (`mm-fx-draw.js`, S). Test: `shared-mm-fx-draw.test.js`. Checks: 11 shapes and 17 glyphs draw on a stub ctx without throwing; Every status id has a glyph; A 50% pie draws an arc of PI.

### Wave 2: serial wiring
**2a**
- **S8 Projectile engine** (RJ, L). Test: `class-weapon-engine.test.js` (Playwright).
  - Scope: `setHeroWeapon(spec)` hook; Bolt fields `st, age, cx, cy, ph, bc, ch`; `_firePlayerVolley` calls `MMProjectile.step`; `wpn_` tolerance; An optional 5th `fp` element (style index), so the guest draws the same path; Duels stay plain.
  - Assertions: (1) `bow_triple` fires 3 bolts at +-0.09 rad; (2) A `hammer_throw` bolt returns to within 16 px; (3) A `star_bounce` bolt survives one wall hit; (4) A save holding `wpn_bow_leaf` keeps it; (5) The existing `class-fire.test.js` passes unchanged.

**2b**
- **S9 Status wiring** (RJ, M). Test: `class-status-arena.test.js`.
  - Scope: `applyStatus(target, id, opts)`; `_calcStats`, `_hitPlayer` and the enemy update read `mods`; the HUD row uses S7.
  - Assertions: (1) `buffDmg = 1.3` still gives x1.3; (2) Weak plus damaging gives x0.75; (3) A slowed enemy moves at 0.65 speed over 30 frames; (4) An 18 px icon is drawn.
- **S10 Mad Maze wiring** (MM, S). Test: `class-weapon-wire.test.js`.
  - Scope: on load and on equip, pass `resolve(cls, styleFor(eq), r)` and `forLevel`; `?weapons=0` restores today's fire.
  - Assertions: (1) A rogue with `wpn_dagger_fan` fires 3; (2) With `?weapons=0` it fires 2; (3) No console errors.

**2c**
- **S11 World debuffs and shrines** (RW, M). Test: `world-status.test.js`.
  - Scope: shrines go through `applyStatus`; the creature table from section c; the Shore is safe; at most 1 status per 0.5 s.
  - Assertions: (1) An ice_wraith bolt can slow; (2) A Shore bolt never does; (3) A shrine shows the damaging icon for 60 s.
- **S12 Passives and items** (RJ, L). Test: `class-unlocks-arena.test.js`.
  - Scope: node mods; Nova II and Dash II; 26 `wpn_` items in `RM_ITEMS`; 70/30 drops; fixed shop stock.
  - Assertions: (1) A L3 rogue lacks `rogue_4`; (2) At L4 the rate is x1.04; (3) A L11 Nova fires 20; (4) The shop lists the family styles at sell x 8.

### Wave 3: UI and polish
- **S13 Ability bar, toast, tooltip** (PG + MM, M). Test: `class-unlock-ui.test.js`, with phone and desktop screenshots. Checks: At 390x844, targets are at least 44 px and do not overlap the stick; The toast shows once per node (`seen`); Long-press opens the sheet; Esc closes it.
- **S14 Backpack weapon compare, enemy pips, damage colours** (RJ, M). Test: `class-weapon-ui.test.js`. Checks: The tooltip shows the pattern line and the delta against the equipped weapon; At most 3 pips per enemy; armorBroken numbers are purple.
- **S15 Time-to-kill sim** (NEW `tests/class-weapon-sim.test.js`, node, M). Checks: Every class+style clears a zone-1 group in 0.7-1.4x of the ranger's time; The S1 weights are calibrated if needed and recorded in `STATUS.md`.
- **S16 Playtest loop** (NEW `tests/class-weapon-playtest.test.js` plus `test-tiers.json`, S). Checks: For 4 classes: equip a style, reach L4, see the toast, kill a group, open the panel; Zero console errors; Median frame under 20 ms at 390x844.

Merge order: S1-S7, then S8, then S9 and S10, then S11 and S12, then S13-S16.
- Opus review is mandatory for S8, S9, S12 (core and co-op) and for S5, S13 (saves).
- Every slice runs `node game/tests/run-all.js` on port 8440.

## (g) Risks
1. **Stale-tab item loss**: S8 ships the `wpn_` tolerance one release before S12 adds drops, and the S8 test covers it.
2. **RJ contention** (S8, S9, S12, S14): keep them strictly serial and keep the logic in the pure modules.
3. **Weights are guesses** (homing 1.15, boomerang 1.25 and so on): normalisation keeps the DPS test valid, and S15 tunes feel.
4. **Phone fps**: the 40 bolts per hero bound, at most 3 orbiters, and lob/chain children taken from the 160 pool (dropped silently when it is empty, as today). B9 perf probe first.
5. **Co-op drift**: the host decides hits and the guest only draws. The `fp` 5th element is optional, so old guests draw straight bolts.
6. **Status unfairness**: the 0.5 s limit, a safe Shore, telegraphed cores, half durations in Picnic, boss immunity and tenacity.
7. **Level source**: account-wide `realm.level` means a new hero inherits passives. That is acceptable for free progression; per-hero levels are an owner decision.
8. **S5 whitelist fix**: heroes already coerced to ranger cannot be recovered. Note it in STATUS.
