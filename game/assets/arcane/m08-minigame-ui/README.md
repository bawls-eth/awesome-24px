# M08 Shared Minigame Result UI

Completed art delivery: 18 sprite IDs and 18 original transparent pixel PNGs. The initial five medals are preserved. Added eight original 32x32 theme trophies (Angler hook, Jam note, Bugs beetle, Stalk turnip, Deepdelve gem, Pixel Pop star, Lantern Dash runner, Isles island), star-full/empty 16x16, `ui_new_best` 48x16 banner, `ui_result_panel` 48x48 nine-slice (6px margins), and `ui_confetti` six-frame horizontal animation with 128x128 cells at 12fps.

`generate-results.js` is deterministic and produces the 13 new sprites with only 0/255 alpha and 16 indexed colors. `preview.png` is a contact sheet for the 13 additions on dark and grey; the five original medals are omitted from this continuation sheet, but are present in the same folder and manifest.

No game code, saves, test files, or Firebase data modified. Claude should register provisional in INDEX, compare against b04 Puffcap and art quality bar, run `node game/tools/art-audit/run.js` and the complete game test suite, then inspect 390x844 phone UI. If any sprite reads as too simple, request redraw before merging. The panel uses 6px edge margins; test stretching with nearest-neighbor sampling.
