// Cycle 9 art (G): Town wildlife drawn from Codex T-batch PNG strips (original art, game/assets/arcane/tNN-*/fauna/).
// Each strip is a 4x export (every art pixel a 4x4 block). The Town draws fauna at the hero's pixel density (W-06: deer ~31 px,
// fox ~25 px next to the 24 px hero), so every frame is baked ONCE at create into ONE canvas texture per animal at HALF native size
// (deer 64 -> 32 px cell, fox / owl 48 -> 24 px cell) with a 2x2 mode filter: a cell is opaque when 2+ of its 4 native pixels are,
// its colour is the most common one (ties -> darker), and a single very dark pixel (an eye) in a solid cell wins so faces keep eyes.
// Frames: <action>_<dir>_<n> on texture fft_<id>; Phaser anims fft_<id>_<action>_<dir>. A strip that fails to load, a missing module
// or ?ffstrips=0 leaves the species on its SVG / pixelized SVG art (unchanged fallback). Nothing runs per frame.
(function (root) {
  'use strict';
  const BASE = 'assets/arcane/';
  // id -> batch folder + native cell. Actions per the T-format: idle 2 f, move 4 f, caught 1 f; dirs right (left = flipX) + down.
  const SPECS = {
    deer: { batch: 't17-deer', cell: 64, fps: { idle: 2, move: 8 } },
    fox: { batch: 't17-fox', cell: 48, fps: { idle: 2, move: 8 } },
    // Cycle 10 art (G): the owl front (down strips) halves with tie = 'rare' (see halve): eye rings / pupils / beak survive instead of
    // merging with the facial-disc rim into one dark band. Its profile keeps the default rule (cleaner wing there).
    owl: { batch: 't17-owl', cell: 48, fps: { idle: 2, move: 8 }, rareTie: 'down' },
    // Cycle 11 art (G): Codex T17 hawk v2 (1c9f2b6, reviewed + merged cycle 11): rufous / cream raptor, airborne flight frames.
    hawk: { batch: 't17-hawk', cell: 48, fps: { idle: 2, move: 8 } },
    // Cycle 12 art (G): Codex T13 wetland set (6da71ca, staged since 2026-11-23, reviewed + accepted cycle 12): the four most-seen
    // pond / meadow SVGs. 32 native baked at half size to a 16 px cell (SVG was 14-18 px). T13 ships no caught_down strip, so the
    // front caught frame reuses the profile caught pose (noCaughtDown).
    frog: { batch: 't13-wetland-fauna', cell: 32, fps: { idle: 2, move: 8 }, noCaughtDown: true },
    snake: { batch: 't13-wetland-fauna', cell: 32, fps: { idle: 2, move: 8 }, noCaughtDown: true },
    trout: { batch: 't13-wetland-fauna', cell: 32, fps: { idle: 2, move: 8 }, noCaughtDown: true },
    catfish: { batch: 't13-wetland-fauna', cell: 32, fps: { idle: 2, move: 8 }, noCaughtDown: true },
    // code-drawn (no PNG): baked 1:1, cell = map size (robin 16 = its old W-06 size; squirrel 20, was 16 and read as a speck)
    bird: { code: true, cell: 16, fps: { idle: 2, move: 8 } },
    squirrel: { code: true, cell: 20, fps: { idle: 2, move: 6 } },
    // Cycle 10 art (G): the three in-village insects were 14 px pixelized-SVG specks. Code art at the hero's density: bee and ladybug
    // 14 px side / top views (head right), monarch 16 px top view (symmetric, so flipX is harmless). Wings beat in the move frames.
    honeybee: { code: true, cell: 14, fps: { idle: 6, move: 12 } },
    ladybug: { code: true, cell: 14, fps: { idle: 3, move: 12 } },
    butterfly: { code: true, cell: 16, fps: { idle: 2, move: 10 } },
    // Cycle 11 art (G): the last three in-village pixelized-SVG specks. Hummingbird 14 px (hover blur wings, ruby throat, needle
    // bill), garden snail 14 px (spiral shell, eye stalks; faces RIGHT like every code map, main.js skips FF_FACES_LEFT for strips),
    // green darner 16 px (green thorax, blue banded abdomen, two glassy wing pairs: flat / up / down).
    hummingbird: { code: true, cell: 14, fps: { idle: 8, move: 12 } },
    snail: { code: true, cell: 14, fps: { idle: 1, move: 3 } },
    dragonfly: { code: true, cell: 16, fps: { idle: 2, move: 14 } },
    // Cycle 13 art (G): the next most-seen SVG Town animals (pond bank + forest edge), original code art with true front views.
    // Fiddler crab 16 px (one oversized yellow claw that waves in idle, eyes on stalks), hedgehog 16 px (spiny dome, cream face,
    // sniffing nose), little brown bat 16 px (membrane wings level / up / down; its right view is a 3/4 turn, far wing short),
    // orb-weaver spider 14 px (top view, pale cross on the abdomen, 8 legs that step). Sizes = their W-06 SVG size (14) or +2.
    crab: { code: true, cell: 16, fps: { idle: 2, move: 8 } },
    hedgehog: { code: true, cell: 16, fps: { idle: 2, move: 6 } },
    bat: { code: true, cell: 16, fps: { idle: 4, move: 10 } },
    spider: { code: true, cell: 14, fps: { idle: 2, move: 8 } },
  };
  // Cycle 9 art (G, original code pixel art): in-village species redrawn at the hero's density (one char = one pixel, '.' clear;
  // light top-left, dark colour-matched rim). Right view only: left = flipX, the down / caught poses reuse the profile frames.
  const CODE = {
    bird: { pal: {'o': '#3b2a22', 'b': '#6e5440', 'B': '#94744f', 'h': '#b89468', 'r': '#c9502e', 'R': '#ec7a4a', 'w': '#efe2c6', 'k': '#15131c', 'y': '#e8a83a', 'l': '#9a6a3a', 'W': '#56402f'},
      idle_right: [
        ['................', '................', '................', '........ooo.....', '.......oBhBo....', '......oBhBbkoyy.', '......obBbbbo...', '..o..orRRbbo....', '.obooorRRrbo....', 'obbBbbrrRrro....', '.obbbBbrrrwo....', '..oobbbwwwwo....', '....oobbwwo.....', '......oooo......', '.......l.l......', '......ll.ll.....'],
        ['................', '................', '................', '................', '........ooo.....', '.......oBhBo....', '......oBhBbkoyy.', '..o...obBbbbo...', '.obo.orRRbbo....', 'obbBoorRRrbo....', '.obbBbrrRrro....', '..oobbBrrrwo....', '....oobbwwwo....', '......oooo......', '.......l.l......', '......ll.ll.....'],
      ],
      move_right: [
        ['................', '....oooo........', '...oBhhBo.ooo...', '....obBBooBhBo..', '.....obBbBhBbkoy', '......obBbbbbo..', '..o..orRRbbbo...', '.oboorRRrbbo....', 'obbBbrrRrro.....', '.obbbbrrrwo.....', '..oobbwwwo......', '....ooooo.......', '................', '................', '................', '................'],
        ['................', '................', '................', '..........ooo...', '.........oBhBo..', '........oBhBbkoy', '..o....obBbbbo..', '.obo..orRRbbo...', 'obbBoorRRrbo....', '.obbbWWWWbro....', '..oobWBBhWwo....', '....oWBhWwo.....', '.....oWWoo......', '......oo........', '................', '................'],
      ],
      // Cycle 11 art (G): true front view (was the profile reused): two eyes, centred beak, red breast, white belly, legs apart.
      idle_down: [
        ['................', '................', '................', '......oooo......', '.....obBBbo.....', '....obhBBhbo....', '....obkBBkbo....', '....orRyyRro....', '...obrRRRRrbo...', '...obrRhRRrbo...', '...obbrrrrbbo...', '....obwwwwbo....', '.....owwwwo.....', '......oooo......', '......l..l......', '.....ll..ll.....'],
        ['................', '................', '................', '................', '......oooo......', '.....obBBbo.....', '....obhBBhbo....', '....obkBBkbo....', '...oorRyyRroo...', '...obrRhRRrbo...', '...obbrrrrbbo...', '....obwwwwbo....', '.....owwwwo.....', '......oooo......', '......l..l......', '.....ll..ll.....'],
      ],
      move_down: [
        ['................', '................', '......oooo......', '.....obBBbo.....', '.oo.obhBBhbo.oo.', 'oBWoobkBBkbooWBo', 'oWBWorRyyRroWBWo', '.oWbbrRRRRrbbWo.', '..oobrRhRRrboo..', '...obbrrrrbbo...', '....obwwwwbo....', '.....owwwwo.....', '......oooo......', '.......ll.......', '................', '................'],
        ['................', '................', '................', '......oooo......', '.....obBBbo.....', '....obhBBhbo....', '....obkBBkbo....', '...oorRyyRroo...', '..oWbrRRRRrbWo..', '.oWBbrRhRRrbBWo.', '.oBWobrrrrboWBo.', '..oo.obwwbo.oo..', '.....owwwwo.....', '......oooo......', '.......ll.......', '................'],
      ],
    },
    squirrel: { pal: {'o': '#2e2a33', 'g': '#6f6c78', 'G': '#8d8a96', 'h': '#b4b1bc', 'c': '#e6dccb', 'k': '#141218', 'n': '#5a4a48', 't': '#7c7986', 'T': '#a6a3b0', 'p': '#c99a9a'},
      idle_right: [
        ['....................', '...ooooo............', '..oTThTTo...........', '.oThhTTTto..........', '.oThTTTTTo....oo....', '.oTTTttTTto..oGo....', '.otTTo.otTo.oGGGo...', '.otTTo..oo.oGhGGko..', '.otTTo....oGhGGGGno.', '.ottTTo...oGGcGGoo..', '..otTTo..ogGcccGo...', '..ottTTo.ogGcccGo...', '...ottTTooggGccgo...', '...otttTTgggGccgo...', '....otttTgggGccgo...', '.....ottttggcccgo...', '......oogggggggo....', '........ogo.oco.....', '........oo..ooo.....', '....................'],
        ['....................', '....................', '...ooooo............', '..oTThTTo.....oo....', '.oThhTTTto...oGo....', '.oThTTTTTo..oGGGo...', '.oTTTttTTtooGhGGko..', '.otTTo.otToGhGGGGno.', '.otTTo..o.oGGcGGoo..', '.ottTTo..ogGcccGo...', '..otTTo..ogGcccGo...', '..ottTTo.ogGcccGo...', '...ottTTooggGccgo...', '...otttTTgggGccgo...', '....otttTgggGccgo...', '.....ottttggcccgo...', '......oogggggggo....', '........ogo.oco.....', '........oo..ooo.....', '....................'],
      ],
      move_right: [
        ['....................', '....................', '....................', '....................', '..ooooo.............', '.oTThTTo............', 'oThhTTTTo.....oo....', 'oThTTTTTTo...oGo....', 'otTTooottTo.oGGGo...', '.ooo...otTToGhGGko..', '........otTTGGGGGno.', '.......ottTggGGcGoo.', '.......ottgggGccGo..', '........ooggggcGGo..', '.......ogo.oogggo...', '......ogo....ogo....', '......oo.....oco....', '.............oo.....', '....................', '....................'],
        ['....................', '....................', '....................', '....................', '....................', '...ooooo............', '..oTThTTo...........', '.oThhTTTTo....oo....', '.oThTTTTTTo..oGo....', '.otTToootTToooGGGo..', '..ooo...otTTGhGGGko.', '.........ottGGGGGGno', '.........ogggggGcGoo', '........ogggggGcco..', '.......ogo.oooocGo..', '.......oco.....ogo..', '.......oo.......oo..', '....................', '....................', '....................'],
      ],
      // Cycle 12 art (G): true front view (was the profile reused): sitting up, two eyes, pink inner ears, cream belly, paws at the
      // chest, the bushy tail rising behind its right shoulder. idle f2 lowers the tail and paws; move f1 swings the tail low, f2 is the
      // hop (body lifted, hind legs apart).
      idle_down: [
        ['..oooo..............', '.oThhTo.............', 'oThTTTTo............', 'oTTTttTo.oo....oo...', 'otTTootToGpo..opGo..', 'otTo..otoGGGooGGGo..', 'otTo...ooGhhGGGGGo..', 'otTTo...oGkGGGGkGo..', '.otTTo..ogGcGGcGgo..', '.otTTTo.oogcnncgo...', '..otTTToTTocccco....', '..ottTTTTogGccGgo...', '...otttToGgchhcgGo..', '....otttoGgccccgGo..', '.....ooooggccccggo..', '........oggccccggo..', '.........ogccccgo...', '........oggoccoggo..', '........ohhoooohho..', '........oooo..oooo..'],
        ['....................', '..oooo..............', '.oThhTo.............', 'oThTTTTo.oo....oo...', 'oTTTttTooGpo..opGo..', 'otTTootToGGGooGGGo..', 'otTo..otoGhhGGGGGo..', 'otTo...ooGkGGGGkGo..', 'otTTo...ogGcGGcGgo..', '.otTTo..oogcnncgo...', '.otTTTo.oTocccco....', '..otTTToTogGccGgo...', '..ottTTToGgccccgGo..', '...otttToGgchhcgGo..', '....otttoggccccggo..', '.....ooooggccccggo..', '.........ogccccgo...', '........oggoccoggo..', '........ohhoooohho..', '........oooo..oooo..'],
      ],
      move_down: [
        ['....................', '....................', '....................', '..oooo...oo....oo...', '.oThhTo.oGpo..opGo..', 'oThTTTTooGGGooGGGo..', 'oTTTttTooGhhGGGGGo..', 'otTTootToGkGGGGkGo..', 'otTo..otogGcGGcGgo..', 'otTo...otogcnncgo...', 'otTTo...oTocccco....', '.otTTo..oogGccGgo...', '.otTTTo.oGgchhcgGo..', '..otTTTooGgccccgGo..', '..ottTTToggccccggo..', '...otttToggccccggo..', '....otttTogccccgo...', '.....ooooggoccoggo..', '........ohhoooohho..', '........oooo..oooo..'],
        ['..oooo..............', '.oThhTo.............', 'oThTTTTo.oo....oo...', 'oTTTttTooGpo..opGo..', 'otTTootToGGGooGGGo..', 'otTo..otoGhhGGGGGo..', 'otTo...ooGkGGGGkGo..', 'otTTo...ogGcGGcGgo..', '.otTTo..oogcnncgo...', '.otTTTo.oTocccco....', '..otTTToTogGccGgo...', '..ottTTToGgchhcgGo..', '...otttToGgccccgGo..', '....otttoggccccggo..', '.....ooooggccccggo..', '.........ogccccgo...', '.........oggccggo...', '.........oho..oho...', '.........oo....oo...', '....................'],
      ],
    },
    // Cycle 10 art (G): honeybee (banded abdomen, amber thorax, glassy wings up / swept back), seven-spot ladybird (top view,
    // spots, white-cheeked head; flight frames lift the hind wings), monarch (orange, black veins, white rim dots; open / mid / closed).
    honeybee: { pal: {'o': '#2a2016', 'y': '#e8b52a', 'Y': '#fbe27a', 'k': '#1e1a20', 'h': '#b77a26', 'H': '#d99a3a', 'w': '#e6f4fa', 'W': '#8fb8cc', 'e': '#f4f0e8', 's': '#4a3a2a', 'l': '#3a2e24'},
      idle_right: [
        ['..............', '..............', '......WW.WW...', '.....WwwWwwW..', '.....WwwWwwW..', '......WwWwW...', '...ooooooWoo..', '..oYkYYkoHHoo.', '.oyykyykoHhkko', 'soyykyykohhkek', '.oyykyykohhkko', '..oooooooolko.', '....l.l.l.....', '..............'],
        ['..............', '..............', '..............', '....WWW.WWW...', '...WwwwWwwwW..', '....WWWoWWW...', '...ooooooooo..', '..oYkYYkoHHoo.', '.oyykyykoHhkko', 'soyykyykohhkek', '.oyykyykohhkko', '..oooooooolko.', '....l.l.l.....', '..............'],
      ],
      move_right: [
        ['..............', '......WW.WW...', '.....WwwWwwW..', '.....WwwWwwW..', '......WwWwW...', '...ooooooWoo..', '..oYkYYkoHHoo.', '.oyykyykoHhkko', 'soyykyykohhkek', '.oyykyykohhkko', '..oooooooolko.', '...l.l.l......', '..............', '..............'],
        ['..............', '..............', '..............', '.WWWW.WWW.....', 'WwwwwWwwwW....', '.WWWWooooooo..', '..oYkYYkoHHoo.', '.oyykyykoHhkko', 'soyykyykohhkek', '.oyykyykohhkko', '..oooooooolko.', '...l.l.l......', '..............', '..............'],
      ],
    },
    ladybug: { pal: {'o': '#2a0e12', 'R': '#d8322a', 'r': '#a81e22', 'h': '#f47a5e', 'k': '#16121a', 'w': '#f4efe6', 'l': '#2a2430', 'W': '#cfe2ea', 'V': '#93b4c4'},
      idle_right: [
        ['..............', '..............', '...l....l.....', '....ooooo.....', '..ooRhRRRoo...', '.oRhhRkkRRokl.', '.oRkkRkkRRokkk', 'loRRRRRRRRokwk', '.oRkkRRkkRokkk', '.orrRrkkrRokl.', '..oorrrrroo...', '....ooooo.....', '...l....l.....', '..............'],
        ['..............', '..............', '....l....l....', '....ooooo.....', '..ooRhRRRoo...', 'loRhhRkkRRok..', '.oRkkRkkRRokkl', '.oRRRRRRRRokwk', '.oRkkRRkkRokkl', 'lorrRrkkrRok..', '..oorrrrroo...', '....ooooo.....', '....l....l....', '..............'],
      ],
      move_right: [
        ['.VV.....VV....', 'VWWV...VWWV...', '.VWWV.VWWV....', '....ooooo.....', '..ooRhRRRoo...', '.oRhhRkkRRok..', '.oRkkRkkRRokkk', '.oRRRRRRRRokwk', '.oRkkRRkkRokkk', '.orrRrkkrRok..', '..oorrrrroo...', '....ooooo.....', '..............', '..............'],
        ['..............', '..............', 'VWWWV..VWWWV..', '....ooooo.....', '..ooRhRRRoo...', '.oRhhRkkRRok..', '.oRkkRkkRRokkk', '.oRRRRRRRRokwk', '.oRkkRRkkRokkk', '.orrRrkkrRok..', '..oorrrrroo...', '....ooooo.....', '..............', '..............'],
      ],
    },
    butterfly: { pal: {'o': '#1c1a22', 'O': '#e07a1e', 'Y': '#f6ad44', 'w': '#f4efe6', 'k': '#2e2834', 'a': '#3c3442', 'h': '#fbd38a'},
      idle_right: [
        ['................', '.....a....a.....', '......a..a......', '.oooo..kk..oooo.', 'oYhOOo.kk.oOOhYo', 'oYOOOOokkoOOOOYo', 'owOoOOokkoOOoOwo', 'oOOOoOokkoOoOOOo', '.oOOOOokkoOOOOo.', '..ooooOkkOoooo..', '..oOOOokkoOOOo..', '.owOoOokkoOoOwo.', '.oOOOOokkoOOOOo.', '..owOoo..ooOwo..', '...ooo....ooo...', '................'],
        ['................', '................', '.....a....a.....', '......a..a......', '..ooo..kk..ooo..', '.oYhOo.kk.oOhYo.', '.oYOOOokkoOOOYo.', '.owOoOokkoOoOwo.', '..oOOOokkoOOOo..', '...oooOkkOooo...', '...oOOokkoOOo...', '..owOOokkoOOwo..', '...oOOokkoOOo...', '....ooo..ooo....', '................', '................'],
      ],
      move_right: [
        ['................', '.....a....a.....', '......a..a......', '.oooo..kk..oooo.', 'oYhOOo.kk.oOOhYo', 'oYOOOOokkoOOOOYo', 'owOoOOokkoOOoOwo', 'oOOOoOokkoOoOOOo', '.oOOOOokkoOOOOo.', '..ooooOkkOoooo..', '..oOOOokkoOOOo..', '.owOoOokkoOoOwo.', '.oOOOOokkoOOOOo.', '..owOoo..ooOwo..', '...ooo....ooo...', '................'],
        ['................', '................', '......a..a......', '.......aa.......', '......okko......', '.....oYkkYo.....', '.....oOkkOo.....', '....oOOkkOOo....', '....owOkkOwo....', '.....oOkkOo.....', '.....ookkoo.....', '.....oOkkOo.....', '.....owkkwo.....', '......okko......', '.......kk.......', '................'],
      ],
    },
    // Cycle 11 art (G): ruby-throated hummingbird, profile hovering (body tilted up, wings a pale blur above / behind).
    hummingbird: { pal: {'o': '#1e2a22', 'g': '#3f8a4e', 'G': '#7cc86a', 'w': '#eef0e4', 'r': '#c8203a', 'R': '#f05a72', 'k': '#121014', 'b': '#2a2426', 't': '#2c4a36', 'W': '#e2f0f6', 'V': '#9cbccc'},
      idle_right: [
        ['..............', '...VV.........', '..VWWV........', '..VWWWV.oo....', '...VWWVoGgo...', '....VVogGkobbb', '......oggrro..', '.....oggrRro..', '....oggwwro...', '...oggwwwo....', '..otgwwwo.....', '.ottoooo......', '.oto..........', '..............'],
        ['..............', '..............', '..............', '........oo....', '.......oGgo...', '......ogGkobbb', '..VVV.oggrro..', '.VWWWoggrRro..', '..VVoggwwro...', '...oggwwwo....', '..otgwwwo.....', '.ottoooo......', '.oto..........', '..............'],
      ],
      move_right: [
        ['..............', '..VV..........', '.VWWV.........', '.VWWWV........', '..VWWWVoooo...', '...VVogGGgo...', '....oggGgkobbb', '...oggrrRro...', '..otgwwrro....', '.ottwwwwo.....', 'otto.ooo......', 'oo............', '..............', '..............'],
        ['..............', '..............', '..............', '..............', '.......oooo...', '.....oogGGgo..', '.VVVVogggGkobb', 'VWWWWoggrrRro.', '.VVVotgwwrro..', '..ottwwwwwo...', '.otto.oooo....', '.oo...........', '..............', '..............'],
      ],
    },
    // Cycle 11 art (G): garden snail, profile facing right (spiral shell, cream foot, two eye stalks; the stalks dip in idle f2,
    // the foot stretches in move f2).
    snail: { pal: {'o': '#2a2024', 'S': '#b67a4a', 'h': '#e6b070', 'd': '#6a4030', 'f': '#a49c86', 'F': '#d2cab0', 'k': '#141218'},
      idle_right: [
        ['..............', '..............', '..............', '....oooo...k.k', '...oShhSo..f.f', '..oShSSSSo.ff.', '..oSSddSdooFfo', '..oSdSdSdooFfo', '..oSdddSdoFfo.', '...oSSSdofFfo.', '.ooooooooFFFfo', 'ofFFFFFFFFFffo', '.oooooooooooo.', '..............'],
        ['..............', '..............', '..............', '....oooo......', '...oShhSo..k.k', '..oShSSSSo.ff.', '..oSSddSdooFfo', '..oSdSdSdooFfo', '..oSdddSdoFfo.', '...oSSSdofFfo.', '.ooooooooFFFfo', 'ofFFFFFFFFFffo', '.oooooooooooo.', '..............'],
      ],
      move_right: [
        ['..............', '..............', '..............', '....oooo...k.k', '...oShhSo..f.f', '..oShSSSSo.ff.', '..oSSddSdooFfo', '..oSdSdSdooFfo', '..oSdddSdoFfo.', '...oSSSdofFfo.', '.ooooooooFFFfo', 'ofFFFFFFFFFffo', '.oooooooooooo.', '..............'],
        ['..............', '..............', '..............', '.....oooo...kk', '....oShhSo..ff', '...oShSSSSo.f.', '...oSSddSdooFo', '...oSdSdSdoFFo', '...oSdddSdoFfo', '....oSSSdofFfo', '..ooooooooFFfo', '.ofFFFFFFFFffo', '..ooooooooooo.', '..............'],
      ],
    },
    // Cycle 11 art (G): common green darner, profile facing right: big blue-green eye, green thorax, blue banded abdomen, two glassy
    // wing pairs. Perched wings flat (idle f1) / raised (idle f2); flight beats up / down.
    dragonfly: { pal: {'o': '#14202a', 'g': '#4aa04a', 'G': '#8ad06a', 'e': '#2a7ab0', 'E': '#7ad0f0', 'a': '#2a5aa8', 'A': '#5a9ae0', 'W': '#e6f4fa', 'V': '#93b4c4', 'l': '#2a2430'},
      idle_right: [
        ['................', '................', '................', '................', '.VVVVVV.VVVVVV..', 'VWWWWWWVWWWWWWV.', '.VVVVVVVVoooooo.', '.ooooooooGgGoEEo', 'oAaAaAaAgggoeeEo', '.ooooooooggloeo.', '.........l.l.o..', '................', '................', '................', '................', '................'],
        ['................', '................', '...VVVV.VVVV....', '..VWWWWVWWWWV...', '...VWWWVWWWV....', '.....VVVVVV.....', '.........oooooo.', '.ooooooooGgGoEEo', 'oAaAaAaAgggoeeEo', '.ooooooooggloeo.', '.........l.l.o..', '................', '................', '................', '................', '................'],
      ],
      move_right: [
        ['................', '................', '...VVVV.VVVV....', '..VWWWWVWWWWV...', '...VWWWVWWWV....', '.....VVVVVV.....', '.........oooooo.', '.ooooooooGgGoEEo', 'oAaAaAaAgggoeeEo', '.ooooooooggooeo.', '.............o..', '................', '................', '................', '................', '................'],
        ['................', '................', '................', '................', '................', '................', '.........oooooo.', '.ooooooooGgGoEEo', 'oAaAaAaAgggoeeEo', '.ooooooVVVVoVeo.', '....VVVWWWWVWVV.', '...VWWWWVVWWWWV.', '....VVVV..VVVV..', '................', '................', '................'],
      ],
    },
    // Cycle 13 art (G): generated by a small layout script (ellipses + outward outline + edge shading), pasted as literals.
    crab: { pal: {'o': '#3a1c1c', 'r': '#c94a30', 'R': '#e8774a', 'd': '#8e2e22', 'y': '#e8b83a', 'Y': '#ffe48a', 'k': '#141218', 'l': '#7a2a20', 'h': '#f0a070', 'e': '#f6eedc'},
      idle_right: [
        ['................', '................', '................', '................', '......k.k.......', '......e.e..oooo.', '......o.o.oyyyyo', '.....oohoooyyy..', '..oooRRRRRoyyyyo', '.oRRRrrrrryrooo.', '..orrrrrrrrro...', '..oddrrrrrddo...', '...oldddddlo....', '...l.ololl.l....', '..l..l.l..l.l...', '....l.l....l....'],
        ['................', '................', '................', '...........oooo.', '......k.k.oyyyyo', '......e.e.oyyy..', '......o.o.oyyyyo', '.....oohoooyooo.', '..oooRRRRRoyo...', '.oRRRrrrrryro...', '..orrrrrrrrro...', '..oddrrrrrddo...', '...oldddddlo....', '...l.ololl.l....', '..l..l.l..l.l...', '....l.l....l....'],
      ],
      move_right: [
        ['................', '................', '................', '................', '......k.k.......', '......e.e..oooo.', '......o.o.oyyyyo', '.....oohoooyyy..', '..oooRRRRRoyyyyo', '.oRRRrrrrryrooo.', '..orrrrrrrrro...', '..oddrrrrrddo...', '...oldddddlo....', '....lololl.ll...', '...lll..l.l..l..', '...l...l..l.....'],
        ['................', '................', '................', '......k.k.......', '......e.e..oooo.', '......o.o.oyyyyo', '.....oohoooyyy..', '..oooRRRRRoyyyyo', '.oRRRrrrrryrooo.', '..orrrrrrrrro...', '..oddrrrrrddo...', '...oldddddlo....', '..ll.ololl.l....', '.l....ll..ll....', '.....l......l...', '................'],
      ],
      idle_down: [
        ['................', '................', '................', '................', '...o..k...k.....', '.o.Yo.e...e.....', 'oYyyo.o...o.....', 'oyyyo.ooooo..oo.', '.oyyooRRRRroorro', '..ooYRrrrrrrrddo', '...orrrrrrrrroo.', '...oddrhrhrddo..', '....lodddddol...', '...l.loooool.l..', '..l.l.......l.l.', '...l.........l..'],
        ['................', '................', '...o............', '.o.Yo...........', 'oYyyo.k...k.....', 'oyyyo.e...e.....', '.oyyo.o...o.....', '..oyo.ooooo..oo.', '...oYoRRRRroorro', '...oyRrrrrrrrddo', '...orrrrrrrrroo.', '...oddrhrhrddo..', '....lodddddol...', '...l.loooool.l..', '..l.l.......l.l.', '...l.........l..'],
      ],
      move_down: [
        ['................', '................', '................', '................', '...o..k...k.....', '.o.Yo.e...e.....', 'oYyyo.o...o.....', 'oyyyo.ooooo..oo.', '.oyyooRRRRroorro', '..ooYRrrrrrrrddo', '...orrrrrrrrroo.', '...oddrhrhrddo..', '....lodddddol...', '...l.loooool.l..', '...ll.......ll..', '..l...........l.'],
        ['................', '................', '................', '...o..k...k.....', '.o.Yo.e...e.....', 'oYyyo.o...o.....', 'oyyyo.ooooo..oo.', '.oyyooRRRRroorro', '..ooYRrrrrrrrddo', '...orrrrrrrrroo.', '...oddrhrhrddo..', '....lodddddol...', '..ll.loooool.ll.', '....l.......l...', '....l.......l...', '...l.........l..'],
      ],
    },
    hedgehog: { pal: {'o': '#2a1e18', 's': '#7a5a3e', 'S': '#4e3826', 't': '#c8a878', 'c': '#ead6b4', 'C': '#fff0d6', 'k': '#141218', 'p': '#c99a9a', 'n': '#3a2a22'},
      idle_right: [
        ['................', '................', '................', '................', '......o.o.......', '....o.t.t.o.....', '..o.tooooot.....', '..tossSsssoo....', '.ossSsssStsso...', '.oSsssStssSpooo.', 'osssStssSscckcco', '.oStssSstsccccck', '.ossSstsSsccccco', '..ootsSsstoccco.', '....nnoooonnoo..', '................'],
        ['................', '................', '................', '................', '......o.o.......', '....o.t.t.o.....', '..o.tooooot.....', '..tossSsssoo....', '.ossSsssStsso...', '.oSsssStssSpooo.', 'osssStssSscckcco', '.oStssSstsccccco', '.ossSstsSsccccck', '..ootsSsstocccoo', '....nnoooonnoo..', '................'],
      ],
      move_right: [
        ['................', '................', '................', '................', '......o.o.......', '....o.t.t.o.....', '..o.tooooot.....', '..tossSsssoo....', '.ossSsssStsso...', '.oSsssStssSpooo.', 'osssStssSscckcco', '.oStssSstsccccck', '.ossSstsSsccccco', '..ootsSsstoccco.', '....onnoonnooo..', '................'],
        ['................', '................', '................', '......o.o.......', '....o.t.t.o.....', '..o.tooooot.....', '..toSsssSsoo....', '.oSsssSsssSto...', '.ossSsssStspooo.', 'osSsssStsscckcco', '.ossStssSsccccck', '.oStssSstsccccco', '..ooSstsSsoccco.', '...nnooooo.nno..', '................', '................'],
      ],
      idle_down: [
        ['................', '................', '.....o.o..o.....', '.....t.t..t.....', '..o.oooooooo.o..', '..tostSsssSsot..', '..otSsssSsssSo..', '.oSsssSsssStsso.', '.osspsssStspSso.', '.oSssccccccstso.', '.ossSkccccksSso.', '..otccccccccso..', '...oScckkccto...', '....occcccco....', '.....noooon.....', '................'],
        ['................', '................', '.....o.o..o.....', '.....t.t..t.....', '..o.oooooooo.o..', '..tostSsssSsot..', '..otSsssSsssSo..', '.oSsssSsssStsso.', '.osspsssStspSso.', '.oSssccccccstso.', '.ossSkccccksSso.', '..otccccccccso..', '...oSccccccto...', '....occkkcco....', '.....noooon.....', '................'],
      ],
      move_down: [
        ['................', '................', '.....o.o..o.....', '.....t.t..t.....', '..o.oooooooo.o..', '..tostSsssSsot..', '..otSsssSsssSo..', '.oSsssSsssStsso.', '.osspsssStspSso.', '.oSssccccccstso.', '.ossSkccccksSso.', '..otccccccccso..', '...oScckkccto...', '....occcccno....', '.....nooooo.....', '................'],
        ['................', '.....o.o..o.....', '.....t.t..t.....', '..o.oooooooo.o..', '..toSsstSsssot..', '..osstSsssSsso..', '.ostSsssSsssSto.', '.oSspsSsssSpsso.', '.ossSccccccsSso.', '.oSsskcccckstso.', '..osccccccccSo..', '...oscckkccso...', '....onccccco....', '.....ooooon.....', '................', '................'],
      ],
    },
    bat: { pal: {'o': '#1a1216', 'm': '#5a4652', 'M': '#34282e', 'b': '#6e5240', 'B': '#93745a', 'k': '#141218', 'p': '#d49a9a'},
      idle_right: [
        ['................', '................', '........o.o.....', '.......oBobo....', '....o..obobooo..', '..ooMo.oBBkoMMoo', '.omMmMoBBBBpmmMm', '.ommmmBbbbmmmmmm', '.omommbbbbmmomom', '..oomobbbbomoo.o', '....o.obbo.o....', '.......oo.......', '................', '................', '................', '................'],
        ['................', '................', '..ooo...o.o.oooo', '.omMMo.oBoboMMMm', '.ommMo.obobMommm', '.ommmMooBBkmmmmm', '.ommmMoBBBBpmmmm', '.ommmmBbbbmmmmmm', '..ommmbbbbmmmooo', '...ooobbbbomo...', '......obbo.o....', '.......oo.......', '................', '................', '................', '................'],
      ],
      move_right: [
        ['................', '................', '..ooo...o.o.oooo', '.omMMo.oBoboMMMm', '.ommMo.obobMommm', '.ommmMooBBkmmmmm', '.ommmMoBBBBpmmmm', '.ommmmBbbbmmmmmm', '..ommmbbbbmmmooo', '...ooobbbbomo...', '......obbo.o....', '.......oo.......', '................', '................', '................', '................'],
        ['................', '................', '........o.o.....', '.......oBobo....', '.......obobo....', '.......oBBko....', '.....ooBBBBpo...', '....oMBbbbMoo...', '...oMmbbbbmMMoo.', '..oMmmbbbbmmmMMo', '.oMmmmmbbmmmmmmm', '.omomomoommmmmmm', '..oomoo..ooooooo', '....o...........', '................', '................'],
      ],
      idle_down: [
        ['................', '................', '......o..o......', '.....oBooBo.....', '...ooobBBboooo..', 'oooMMoBkkBoMMMoo', 'mMMmoMoppoMommMM', 'mmmmmmBbbBmmmmmm', 'mommmmbbbbmmmmom', 'o.oomobbbbomoo.o', '....o.obbo.o....', '.......oo.......', '................', '................', '................', '................'],
        ['................', '................', 'ooooo.o..o..oooo', 'mMMMMoBooBooMMMM', 'mmmoMobBBboMommm', 'mmmmmMBkkBMmmmmm', 'mmmmmMoppoMmmmmm', 'mmmmmmBbbBmmmmmm', 'oommmmbbbbmmmmoo', '..oomobbbbomoo..', '....o.obbo.o....', '.......oo.......', '................', '................', '................', '................'],
      ],
      move_down: [
        ['................', '................', 'ooooo.o..o..oooo', 'mMMMMoBooBooMMMM', 'mmmoMobBBboMommm', 'mmmmmMBkkBMmmmmm', 'mmmmmMoppoMmmmmm', 'mmmmmmBbbBmmmmmm', 'oommmmbbbbmmmmoo', '..oomobbbbomoo..', '....o.obbo.o....', '.......oo.......', '................', '................', '................', '................'],
        ['................', '................', '......o..o......', '.....oBooBo.....', '.....obBBbo.....', '.....oBkkBo.....', '.....ooppoo.....', '...ooMBbbBMoo...', '.oomMmbbbbmMMoo.', 'omMMmmbbbbmmmMMo', 'mMmmmmmbbmmmmmmM', 'mmmomomoomomommm', 'ooo.o.o..o.o.ooo', '................', '................', '................'],
      ],
    },
    spider: { pal: {'o': '#24160e', 'a': '#b0702e', 'A': '#d89a50', 'd': '#7a4a1e', 'h': '#6e4424', 'l': '#3e2a1c', 'w': '#f4e6c0', 'k': '#141218'},
      idle_right: [
        ['..............', '..............', '.......l......', '....oo.l....l.', '...oAAlol..l..', '..oAwaaAlool..', '.oAwwwaahhkoll', '.oaawaaahhhl..', '.owaaawahhhl..', '..odaadalll.ll', '...oddoll.l...', '....ool.l..l..', '........l..l..', '..............'],
        ['..............', '.......l......', '.......l....l.', '....oo..l..l..', '...oAAool..l..', '..oAwaAAlol...', '.oAwwwaahhko..', '.oaawaaahhhlll', '.owaaawahhhlll', '..odaaadoll...', '...oddlo.ll...', '....oo..l.l...', '........l..l..', '........l..l..'],
      ],
      move_right: [
        ['..............', '..............', '..............', '....ooll......', '...oAAoll...l.', '..oAwaAalool.l', '.oAwwwaahhkll.', '.oaawaaahhho..', '.owaaawahhho..', '..odaadalllll.', '...oddoll..l.l', '....oo.ll..l..', '......l.......', '..............'],
        ['..............', '.......l......', '.......l....l.', '....oo..l..l..', '...oAAool..l..', '..oAwaAAlol...', '.oAwwwaahhko..', '.oaawaaahhhlll', '.owaaawahhhlll', '..odaaadoll...', '...oddlo.ll...', '....oo..l.l...', '........l..l..', '........l..l..'],
      ],
      idle_down: [
        ['..............', '.....oooo.....', '....oAAAAo....', '...oAawwaao...', '.l.oaawwaao.l.', '..loawaawaol..', '...lwaaaawl...', '...odaaaado...', '.llloaaaaolll.', '....lhhhhl....', '....lhkkhl....', '..lllohholll..', '....l.oo.l....', '...l......l...'],
        ['..............', '.....oooo.....', '....oAAAAo....', '.l.oAawwaao...', '..loaawwaao...', '...lawaawao...', '...lwaaaawol..', '...odaaaaal.l.', '....oaaaalll..', '.llllhhhho....', '...llhkkho....', '..l..lhholl...', '....l.oo..ll..', '....l.........'],
      ],
      move_down: [
        ['..............', '.....oooo.....', '....oAAAAo....', '...oAawwaao.l.', '...oaawwaaol..', '...oawaawal...', '..lowaaaawl...', '.l.laaaaado...', '..lllaaaao....', '....ohhhhllll.', '....ohkkhll...', '...llohhl..l..', '..ll..oo.l....', '.........l....'],
        ['..............', '.....oooo.....', '....oAAAAo....', '.l.oAawwaao...', '..loaawwaao...', '...lawaawao...', '...lwaaaawol..', '...odaaaaal.l.', '....oaaaalll..', '.llllhhhho....', '...llhkkho....', '..l..lhholl...', '....l.oo..ll..', '....l.........'],
      ],
    },
  };
  // Cycle 13 art (G): ID-59 first-visit hello heart (original code art, U cycle 11 spec: drawn in code, G owns the look). A 7 x 7 px
  // heart (5 x 5 fill + outline) in a 9 x 8 cell: f0 small pop-in, f1 full, f2 full + white glint, f3 full. Baked to texture fft_heart
  // (frames heart_0..3) and anim fft_heart_pop (one shot) on every Town bake, also with ?ffstrips=0 (it is not a species).
  const HEART = { pal: {'o': '#5a1630', 'R': '#e0405a', 'D': '#b02848', 'h': '#ffb0c0', 'w': '#ffffff'},
    frames: [
      ['.........', '.........', '.........', '...o.o...', '..oRoRo..', '..oRRDo..', '...oDo...', '....o....'],
      ['.........', '..oo.oo..', '.oRhoRRo.', '.oRRRRRo.', '.oRRRRDo.', '..oRRDo..', '...oDo...', '....o....'],
      ['.........', '..oo.oo..', '.ohwoRRo.', '.oRRRRRo.', '.oRRRRDo.', '..oRRDo..', '...oDo...', '....o....'],
      ['.........', '..oo.oo..', '.oRhoRRo.', '.oRRRRRo.', '.oRRRRDo.', '..oRRDo..', '...oDo...', '....o....'],
    ],
  };

  const STRIPS = [
    { action: 'idle', dir: 'right', file: 'idle' }, { action: 'idle', dir: 'down', file: 'idle_down' },
    { action: 'move', dir: 'right', file: 'move' }, { action: 'move', dir: 'down', file: 'move_down' },
    { action: 'caught', dir: 'right', file: 'caught' }, { action: 'caught', dir: 'down', file: 'caught_down' },
  ];
  // Cycle 12: the strips a species must load (T13 has no caught_down; its front caught frame aliases the profile one).
  const stripsFor = (id) => STRIPS.filter((s) => !(SPECS[id].noCaughtDown && s.file === 'caught_down'));
  const enabled = () => { try { return !/[?&]ffstrips=0(&|$)/.test(root.location.search); } catch (e) { return true; } };
  const srcKey = (id, file) => `ffsrc_${id}_${file}`;
  const url = (id, file) => `${BASE}${SPECS[id].batch}/fauna/ff_${id}_${file}.png`;
  const lum = (r, g, b) => r * 0.3 + g * 0.59 + b * 0.11;

  // 4x PNG image -> native RGBA (sample the centre of each 4x4 block).
  function nativeData(img) {
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0);
    const src = cx.getImageData(0, 0, w, h).data;
    const nw = w >> 2, nh = h >> 2, out = new Uint8ClampedArray(nw * nh * 4);
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
      const s = ((y * 4 + 1) * w + (x * 4 + 1)) * 4, d = (y * nw + x) * 4;
      out[d] = src[s]; out[d + 1] = src[s + 1]; out[d + 2] = src[s + 2]; out[d + 3] = src[s + 3] > 127 ? 255 : 0;
    }
    return { w: nw, h: nh, data: out };
  }

  // native RGBA -> half size, 2x2 mode filter (see the header). tie 'rare' (cycle 10): a 2-2 tie keeps the colour that is RARER in the
  // whole frame (a feature colour: eye ring, pupil, beak) rather than the darker one (usually the common outline), then darker.
  function halve(n, tie) {
    const hw = n.w >> 1, hh = n.h >> 1, out = new Uint8ClampedArray(hw * hh * 4), p = n.data;
    const freq = new Map();
    if (tie === 'rare') for (let i = 0; i < p.length; i += 4) if (p[i + 3]) { const k = (p[i] << 16) | (p[i + 1] << 8) | p[i + 2]; freq.set(k, (freq.get(k) || 0) + 1); }
    const fq = (c) => freq.get((c[0] << 16) | (c[1] << 8) | c[2]) || 0;
    for (let y = 0; y < hh; y++) for (let x = 0; x < hw; x++) {
      const cols = [];
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
        const s = ((y * 2 + j) * n.w + (x * 2 + i)) * 4;
        if (p[s + 3]) cols.push([p[s], p[s + 1], p[s + 2]]);
      }
      const d = (y * hw + x) * 4;
      if (cols.length < 2) continue;
      const count = (c) => cols.filter((o) => o[0] === c[0] && o[1] === c[1] && o[2] === c[2]).length;
      let best = cols[0];
      cols.forEach((c) => {
        const k = count(c), kb = count(best);
        if (k > kb) { best = c; return; }
        if (k !== kb) return;
        if (tie === 'rare' && fq(c) !== fq(best)) { if (fq(c) < fq(best)) best = c; return; }
        if (lum(c[0], c[1], c[2]) < lum(best[0], best[1], best[2])) best = c;
      });
      if (cols.length === 4) {
        const dark = cols.reduce((a, c) => (lum(c[0], c[1], c[2]) < lum(a[0], a[1], a[2]) ? c : a), cols[0]);
        if (count(dark) === 1 && lum(dark[0], dark[1], dark[2]) < 70 && lum(best[0], best[1], best[2]) - lum(dark[0], dark[1], dark[2]) > 90) best = dark;
      }
      out[d] = best[0]; out[d + 1] = best[1]; out[d + 2] = best[2]; out[d + 3] = 255;
    }
    return { w: hw, h: hh, data: out };
  }

  // Code species: frames straight from the CODE maps at 1:1; caught / down reuse the profile (frame aliases + anim copies).
  function bakeCode(scene, st, id) {
    const spec = SPECS[id], m = CODE[id], n = spec.cell;
    const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    // Cycle 11: a map may carry its own idle_down / move_down (true front view, e.g. the robin); otherwise down reuses the profile.
    const list = [['idle', 'right', m.idle_right], ['move', 'right', m.move_right]];
    if (m.idle_down) list.push(['idle', 'down', m.idle_down]);
    if (m.move_down) list.push(['move', 'down', m.move_down]);
    const total = list.reduce((a, l) => a + l[2].length, 0);
    const cv = document.createElement('canvas'); cv.width = total * n; cv.height = n;
    const cx = cv.getContext('2d');
    const slots = []; let col = 0;
    list.forEach(([action, dir, frames]) => frames.forEach((rows, f) => {
      const data = new Uint8ClampedArray(n * n * 4);
      rows.forEach((row, y) => { for (let x = 0; x < n; x++) { const c = row[x]; if (c === '.' || !m.pal[c]) continue; const v = rgb(m.pal[c]), d = (y * n + x) * 4; data[d] = v[0]; data[d + 1] = v[1]; data[d + 2] = v[2]; data[d + 3] = 255; } });
      cx.putImageData(new ImageData(data, n, n), col * n, 0);
      slots.push({ action, dir, f, col }); col++;
    }));
    const key = `fft_${id}`;
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const tex = scene.textures.addCanvas(key, cv);
    const own = (action, dir) => slots.filter((sl) => sl.action === action && sl.dir === dir);
    const src = (action, dir) => (own(action, dir).length ? own(action, dir) : own(action, 'right'));
    ['idle', 'move'].forEach((action) => ['right', 'down'].forEach((dir) => src(action, dir).forEach((sl) => tex.add(`${action}_${dir}_${sl.f}`, 0, sl.col * n, 0, n, n))));
    ['right', 'down'].forEach((dir) => tex.add(`caught_${dir}_0`, 0, src('idle', dir)[0].col * n, 0, n, n));
    ['idle', 'move'].forEach((action) => ['right', 'down'].forEach((dir) => {
      const ak = `${key}_${action}_${dir}`;
      if (scene.anims.exists(ak)) return;
      const frames = src(action, dir).map((sl) => ({ key, frame: `${action}_${dir}_${sl.f}` }));
      scene.anims.create({ key: ak, frames, frameRate: spec.fps[action], repeat: -1 });
    }));
    // journal: idle f1 at 6x (crisp in the 160 px card)
    const c2 = document.createElement('canvas'); c2.width = n * 6; c2.height = n * 6;
    const g2 = c2.getContext('2d'); g2.imageSmoothingEnabled = false; g2.drawImage(cv, 0, 0, n, n, 0, 0, n * 6, n * 6);
    st.caughtUrl[id] = c2.toDataURL('image/png');
    // Museum grid (cycle 10): the same pose at the largest integer zoom that fits 56 px (bee / ladybug 4x, robin / monarch 3x)
    const z = Math.max(1, Math.floor(56 / n)), c3 = document.createElement('canvas'); c3.width = n * z; c3.height = n * z;
    const g3 = c3.getContext('2d'); g3.imageSmoothingEnabled = false; g3.drawImage(cv, 0, 0, n, n, 0, 0, n * z, n * z);
    st.thumbUrl[id] = c3.toDataURL('image/png');
    st.ids.push(id); st.cells[id] = n;
  }

  // Cycle 13 (G): heart texture + one-shot pop anim. Cheap (4 tiny frames), idempotent, independent of ?ffstrips.
  function bakeHeart(scene) {
    const W = 9, H = 8, fr = HEART.frames;
    if (scene.textures.exists('fft_heart')) return true;
    const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const cv = document.createElement('canvas'); cv.width = W * fr.length; cv.height = H;
    const cx = cv.getContext('2d');
    fr.forEach((rows, f) => {
      const data = new Uint8ClampedArray(W * H * 4);
      rows.forEach((row, y) => { for (let x = 0; x < W; x++) { const c = row[x]; if (c === '.' || !HEART.pal[c]) continue; const v = rgb(HEART.pal[c]), d = (y * W + x) * 4; data[d] = v[0]; data[d + 1] = v[1]; data[d + 2] = v[2]; data[d + 3] = 255; } });
      cx.putImageData(new ImageData(data, W, H), f * W, 0);
    });
    const tex = scene.textures.addCanvas('fft_heart', cv);
    fr.forEach((_, f) => tex.add(`heart_${f}`, 0, f * W, 0, W, H));
    if (!scene.anims.exists('fft_heart_pop')) {
      scene.anims.create({ key: 'fft_heart_pop', frames: [0, 1, 2, 3].map((f) => ({ key: 'fft_heart', frame: `heart_${f}` })), frameRate: 10, repeat: 0 });
    }
    return true;
  }

  const MMTownFauna = {
    CODE,
    SPECS,
    enabled,
    ids: () => Object.keys(SPECS),
    url,
    stripsFor,
    // Phaser preload: queue every strip as a plain image (the bake slices it).
    preload(scene) {
      if (!enabled()) return;
      Object.keys(SPECS).filter((id) => !SPECS[id].code).forEach((id) => stripsFor(id).forEach((s) => scene.load.image(srcKey(id, s.file), url(id, s.file))));
    },
    // Phaser create: one canvas texture + anims per species whose 6 strips all loaded. Returns the wired ids.
    bake(scene) {
      const st = scene.ffStrips = { on: enabled(), ids: [], cells: {}, ms: 0, caughtUrl: {}, thumbUrl: {} };
      try { st.heart = bakeHeart(scene); } catch (e) { st.heart = false; } // cycle 13: ID-59 heart, also with ?ffstrips=0
      if (!st.on) return st;
      const t0 = performance.now();
      Object.keys(SPECS).forEach((id) => {
        try {
          if (SPECS[id].code) { bakeCode(scene, st, id); return; }
          if (!stripsFor(id).every((s) => scene.textures.exists(srcKey(id, s.file)))) return;
          const half = SPECS[id].cell >> 1;
          const parts = stripsFor(id).map((s) => {
            const n = nativeData(scene.textures.get(srcKey(id, s.file)).getSourceImage());
            return { s, n, frames: Math.round(n.w / SPECS[id].cell) };
          });
          const total = parts.reduce((a, p) => a + p.frames, 0);
          const cv = document.createElement('canvas'); cv.width = total * half; cv.height = half;
          const cx = cv.getContext('2d');
          const slots = [];
          let col = 0;
          parts.forEach((p) => {
            for (let f = 0; f < p.frames; f++) {
              const cell = { w: SPECS[id].cell, h: SPECS[id].cell, data: new Uint8ClampedArray(SPECS[id].cell * SPECS[id].cell * 4) };
              for (let y = 0; y < cell.h; y++) {
                const so = (y * p.n.w + f * cell.w) * 4;
                cell.data.set(p.n.data.subarray(so, so + cell.w * 4), y * cell.w * 4);
              }
              const h2 = halve(cell, SPECS[id].rareTie === p.s.dir ? 'rare' : undefined);
              cx.putImageData(new ImageData(h2.data, h2.w, h2.h), col * half, 0);
              slots.push({ name: `${p.s.action}_${p.s.dir}_${f}`, col });
              col++;
            }
            // The journal shows the caught pose at an integer zoom of the NATIVE art (crisp in the 160 px card).
            if (p.s.action === 'caught' && p.s.dir === 'right') {
              const z = SPECS[id].cell >= 64 ? 2 : 3, c2 = document.createElement('canvas');
              c2.width = p.n.w * z; c2.height = p.n.h * z;
              const t = document.createElement('canvas'); t.width = p.n.w; t.height = p.n.h;
              t.getContext('2d').putImageData(new ImageData(p.n.data, p.n.w, p.n.h), 0, 0);
              const g2 = c2.getContext('2d'); g2.imageSmoothingEnabled = false; g2.drawImage(t, 0, 0, c2.width, c2.height);
              st.caughtUrl[id] = c2.toDataURL('image/png');
              st.thumbUrl[id] = t.toDataURL('image/png'); // Museum grid (cycle 10): the same caught pose, native 1x (48 / 64 px)
            }
          });
          const key = `fft_${id}`;
          if (scene.textures.exists(key)) scene.textures.remove(key);
          const tex = scene.textures.addCanvas(key, cv);
          slots.forEach((sl) => tex.add(sl.name, 0, sl.col * half, 0, half, half));
          if (!slots.some((sl) => sl.name === 'caught_down_0')) { const c = slots.find((sl) => sl.name === 'caught_right_0'); if (c) tex.add('caught_down_0', 0, c.col * half, 0, half, half); }
          STRIPS.forEach((s) => {
            if (s.action === 'caught') return;
            const ak = `${key}_${s.action}_${s.dir}`;
            if (scene.anims.exists(ak)) return;
            const frames = slots.filter((sl) => sl.name.startsWith(`${s.action}_${s.dir}_`)).map((sl) => ({ key, frame: sl.name }));
            scene.anims.create({ key: ak, frames, frameRate: SPECS[id].fps[s.action], repeat: -1 });
          });
          st.ids.push(id);
          st.cells[id] = half;
        } catch (e) { /* this species keeps its SVG art */ }
      });
      st.ms = Math.round(performance.now() - t0);
      return st;
    },
    has(scene, id) { return !!(scene.ffStrips && scene.ffStrips.ids.indexOf(id) >= 0); },
    // Which strip to show: down when moving mostly toward the camera, else the profile (left = flipX of right).
    pick(dx, dy) { return dy > Math.abs(dx) ? 'down' : 'right'; },
    play(sprite, id, action, dir) {
      const ak = `fft_${id}_${action}_${dir}`;
      if (sprite.anims && sprite.anims.currentAnim && sprite.anims.currentAnim.key === ak && sprite.anims.isPlaying) return;
      sprite.play(ak, true);
    },
    // ---- Cycle 13 (G): ID-59 first-visit hello. Art + presentation only; S owns WHEN (radius, once per animal, save bit, toast). ----
    HEART,
    bakeHeart,
    // True when the species has its own side + front frames (strip or code art), so it can turn toward the hero (U spec point 2).
    canTurn(scene, id) { return this.has(scene, id); },
    // Turn a strip / code specimen toward a point (the hero): front view when the hero is below it, else the profile, flipped when
    // the hero is to the left. Plays idle in that direction. Returns false (and does nothing) for SVG species.
    faceToward(scene, sprite, id, tx, ty) {
      if (!this.has(scene, id) || !sprite || !sprite.scene) return false;
      const dx = tx - sprite.x, dy = ty - sprite.y;
      sprite.ffDir = this.pick(dx, dy);
      if (Math.abs(dx) > 2) sprite.setFlipX(dx < 0);
      this.play(sprite, id, 'idle', sprite.ffDir);
      return true;
    },
    // Show the heart above a sprite for opts.ms (default 1200). It follows the sprite and draws just above it (depth + 1).
    // opts.reduced (reduced motion OR flashes off, the caller decides): static full heart (heart_1), no pop / rise / fade.
    // Otherwise: pop-in anim (small -> full -> glint -> full, 0.4 s), a 3 px rise, a fade over the last 0.25 s.
    // Returns the heart Sprite (destroyed by itself; destroying it early is safe), or null if the heart could not be baked.
    showHeart(scene, target, opts) {
      opts = opts || {};
      try { bakeHeart(scene); } catch (e) { return null; }
      if (!target || !target.scene) return null;
      const ms = opts.ms || 1200, reduced = !!opts.reduced;
      const top = () => target.y - (target.displayHeight || 16) / 2 - 5;
      const h = scene.add.sprite(target.x, top(), 'fft_heart', reduced ? 'heart_1' : 'heart_0').setDepth((target.depth || 0) + 1);
      h.ffHeart = { reduced, rise: 0, ms };
      if (!reduced) {
        h.play('fft_heart_pop');
        scene.tweens.add({ targets: h.ffHeart, rise: 3, duration: 400, ease: 'Quad.easeOut' });
        scene.tweens.add({ targets: h, alpha: 0, delay: Math.max(0, ms - 250), duration: 250 });
      }
      const follow = () => { if (!h.scene) return; if (target.scene) { h.x = Math.round(target.x); h.y = Math.round(top() - h.ffHeart.rise); h.setDepth((target.depth || 0) + 1); } };
      follow();
      scene.events.on('update', follow);
      h.once('destroy', () => scene.events.off('update', follow));
      scene.time.delayedCall(ms, () => { if (h.scene) h.destroy(); });
      return h;
    },
    _halve: halve,
  };
  root.MMTownFauna = MMTownFauna;
  if (typeof module !== 'undefined' && module.exports) module.exports = MMTownFauna;
})(typeof window !== 'undefined' ? window : globalThis);
