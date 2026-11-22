# Chip audio (8-bit layer) - MMChip + MMSfx

Owner ask: "We want a nice 8-bit feel." Everything is pure WebAudio synthesis: no audio files, no network, no `Math.random`/`Date`
(noise and music variation come from a seeded LCG counter).

## Files
- `game/shared/mm-chip.js` (`MMChip`): channels, envelopes, SFX library, music cues, sequencer, prefs reader.
- `game/shared/sfx.js` (`MMSfx`): the API every page already uses. `play(name)` now plays the MMChip voice for any old or new
  name; without MMChip it falls back to the original recipes. In a browser, `sfx.js` loads `mm-chip.js` from its own folder when a
  page did not include it, so game pages get the 8-bit voices without editing their HTML (adding
  `<script src="../../shared/mm-chip.js"></script>` before `sfx.js` is still the better form: it is ready before the first gesture).
- Test: `game/tests/shared-mm-chip.test.js` (node / smoke).

## Channels
| Channel | Use | How |
|---|---|---|
| `p1`, `p2` | lead / harmony, most SFX | pulse PeriodicWave, duty 12.5 / 25 / 50% (square fallback) |
| `tri` | bass, kicks, thumps | triangle oscillator |
| `noise` | hats, snares, hits, splashes | seeded 0.5 s noise buffer through a bandpass / highpass |

Voice data: `{ch, duty, n:[midi..] (arpeggio), step, slide (semitones over dur), dur, vol, at, a, d, s, r}`. One voice = one
oscillator, so rate limits (`MMSfx.LIMITS`) keep the same meaning.

## Settings (no new keys)
- Mute: `mm-sfx-muted` (every page's mute button) wins when written; otherwise the Town save's `pixeltown-save-v1.sfxMuted`.
- Music: off by default. Follows the Town's existing **Music** toggle (`pixeltown-save-v1.musicEnabled`) or `sfx.setMusic(true)`.
- Low power: no music loops when `pixeltown-access-v1.lowGfx` is on (or `window.__mmPerf.lowGfx`, or `create({lowGfx:true})`).
- Volume: `setVolume(0..1)` on the master bus. Music ducks to 45% under each SFX and recovers in 0.25 s.
- Music only starts from a user gesture (`music(cue)` creates/resumes the context; call it from a click/tap handler).

## SFX library (`MMSfx.play(name)`)
UI: `blip`, `select`, `confirm`, `back`, `ui_open`, `ui_close`, `error`
Rewards: `coin`, `pickup`, `combo1`..`combo8` (rising ladder), `perfect`, `level_up`, `unlock`, `chest`
Action: `miss`, `hit`, `hurt`, `death`, `jump`, `land`, `pop`, `merge`, `stack_drop`
Fishing: `splash`, `bite`, `reel`, `catch`
Flowers: `bloom_c`, `bloom_d`, `bloom_e`, `bloom_g` (C D E G)
Realm extras: `shoot`, `kill`, `boss`, `warn`, `portal`, `shutter`

Old names keep working (aliases): `shot`->`shoot`, `levelup`->`level_up`, `bag_rare`->`chest`, `boss_awaken`->`boss`,
`claim`->`confirm`, `ui_tap`->`blip`; Town: `sell`->`confirm`, `achievement`->`unlock`, `deny`->`error`
(`hit`, `hurt`, `pickup`, `kill`, `warn`, `portal`, `catch`, `coin`, `pop`, `shutter` are direct).

## Music cues (`MMSfx.music(cue)`, `stopMusic()`, `musicCue()`)
| Cue | Mood | Key / tempo | Bars | Loop |
|---|---|---|---|---|
| `hub` | home, calm | C major, 84 | 4 | yes |
| `town` | town day | F major, 112 | 8 | yes (wired: Town Music toggle) |
| `realm` | adventure | D minor, 132 | 8 | yes |
| `dungeon` | tense | A harmonic minor, 96 | 4 | yes |
| `minigame` | upbeat | G major, 144 | 4 | yes |
| `results` | jingle | C major, 150 | 2 | one-shot |

All melodies are original. Each later loop pass re-renders with the next seed: a few lead notes step to a neighbouring scale tone
and some hats drop, deterministic per seed. The first pass is always the written tune.

## Wired this session
- Town (`game/main.js`): `SFX.catch/coin/sell/achievement/deny/pop/shutter` play the chip voices through one MMSfx instance on the
  Town's AudioContext; the Town Music toggle plays the `town` loop (the old chord pad stays as the fallback, and in low-gfx).
- Every page using MMSfx (Realm, Mad Maze, minigames) already hears the chip versions of its existing names via the aliases.

## To wire next session (owners of each dir; call through the existing `sfx.play(...)`)
| Game | Now calls | Should also call |
|---|---|---|
| Realm (`realm.js`) | shot, hit, kill, hurt, pickup, levelup, portal, bag_rare, boss_awaken, warn, claim | `death` on player death, `chest` on loot, `ui_open`/`ui_close` panels, music `realm` (zone 0-2) / `dungeon` (deep zones, bosses) when Music is on |
| Mad Maze | claim, hit, levelup, pickup, portal, warn | `jump`/`land`, `death`, music `dungeon` |
| Angler | boss_awaken, hurt, pickup, ui_tap, warn | `splash` (cast), `bite`, `reel` (rate-limited while reeling), `catch`, `miss` (line snap), `results` |
| Pop | levelup, ui_tap | `pop`, `combo1`..`combo8` by chain length, `perfect`, music `minigame`, `results` |
| Stack | hurt, levelup, ui_tap | `stack_drop`, `perfect` (exact drop), `miss`, `merge`, music `minigame`, `results` |
| Dash | claim, hurt, pickup, ui_tap | `jump`, `land`, `coin`, `death`, music `minigame`, `results` |
| Echo | claim, ui_tap (+ own flower sine) | `bloom_c/d/e/g` for the four flowers, `error` on a wrong note, `perfect` on a clean round |
| Deep Delve | claim, hit, hurt, levelup, pickup | `chest`, `unlock`, `death`, music `dungeon` |
| Jam | (check source) | `blip`/`select`, `combo1`..`8`, `perfect`, `miss`, music `minigame` |
| Stalk | pickup, levelup | `coin` (sell), `error` (can't afford), `ui_open`/`ui_close` |
| Festival bugs | (check source) | `catch`, `miss`, `combo1`..`8`, `results` |
| Hub / home | - | music `hub`, `ui_open`/`ui_close`, `select`/`confirm`/`back` |
