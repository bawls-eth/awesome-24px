# Cycle 6 - Codex branch review (B-03 Shagtusk, Sabrefang, saddles, Icicle Bat frost)

Branch `cyc6-codex-review` (worktree), cut from 6893278. Port 9607. Not pushed. Browsers only through /tmp/bt.sh. No Firebase, no
firebase-config.js / net.js / ci-status.json touched.

## Verdicts

| Branch | Commit | Audit (run.js) | Own decode | Visual | Verdict |
|---|---|---|---|---|---|
| `codex/b03-icicle-bat-frost-detail` | 5985c6c | 0 rows | clean, bbox identical to accepted base | wing-edge ice spikes, poses/views unchanged | **PASS, merged provisional** |
| `codex/b03-shagtusk` | 8194913 | 0 rows | clean | true views OK; death collapses in one step, walk legs static, attack weak, fur reads as flat rock | **REDO, not merged** |
| `codex/b03-sabrefang` | 753fc9d | 0 rows | clean | right view is a round ball body (312x308), not a cat profile; no stripes; same death jump | **REDO, not merged** |
| `codex/b03-saddle-overlays` | a943caf | 0 rows | clean | down-view saddle painted over the mount's face; depends on two failed mounts | **REDO, not merged** |

Specific redraw feedback (frame numbers, bbox targets) is in `CODEX-REMAKE-QUEUE.md`, "UPDATE 2026-11-25 (cycle 6 codex review, Claude)".

## How the audit was run (nothing unaccepted staged)
`git archive <branch> game` into a scratch dir per branch (each branch already carries its own INDEX.json entry), then
`node <scratch>/game/tools/art-audit/run.js --json out.json` and filtered rows by batch id. Output actually seen:

```
shag   art-audit: 70 batches, 2813 assets; blocker 0, needs-redo 2, nit 497   -> b03-shagtusk rows 0
sabre  art-audit: 70 batches, 2813 assets; blocker 0, needs-redo 2, nit 497   -> b03-sabrefang rows 0
saddle art-audit: 70 batches, 2813 assets; blocker 0, needs-redo 2, nit 497   -> b03-saddle-overlays rows 0
bat    (branch base 503ae8b)                                                   -> b03-icicle-bat rows 0
merged worktree after the bat merge:
       art-audit: 69 batches, 2801 assets; blocker 0, needs-redo 2, nit 497   -> b03-icicle-bat rows 0
       needs-redo b12r prop_rock_big / prop_boulder_cluster [anchor]  (pre-existing, unrelated)
```
Note: run.js skips the anchor check for ids matching `bat|saddle|overlay`, and its outline/contrast/face heuristics look at frame 0 only, so
"0 rows" says nothing about views or animation; that part is the visual review.

## Own numeric decode (Pillow, scratch script)
Per strip: PNG size = frames x cell, frames vs spec (idle 4, move 6, attack 5, death 5), soft-alpha pixel count, 4x4 block uniformity,
distinct colours, per-frame bbox, byte-identical frames.
- All 48 strips: sizes right, frame counts match manifest and spec, 0 soft-alpha pixels, 0 non-uniform 4x4 blocks, lowest opaque row = anchor.y
  in every frame (347 for L96 / 384 cells, 171 for the S48 / 192 bat). Cells are 384 for the L96 mounts (queue format: 4 x native), not 256.
- Colours: Shagtusk 8-13, Sabrefang 7-12, saddles 9-11, bat 8-9 (all bat colours are in its palette.json).
- Byte-identical frames: Shagtusk attack f1==f5 in all dirs (recovery = idle); saddles repeat (e.g. `shagtusk_saddle_move_down` f1==f5, f2==f6).
- Shagtusk death down/up: f1-f3 standing bbox, f4 lying; f4 and f5 same bbox. Sabrefang same (f3 276x244 -> f4 288x152).
- Sabrefang `idle_right` bbox 312x308 (as tall as wide: not a profile). Shagtusk `idle_right` 348x264.
- Saddle down bbox y 36-203 (Shagtusk) / 40-207 (Sabrefang) vs mount top y 64: overlaps the eyes and pokes above the head.
- Bat frost revision: every strip's per-frame bbox identical to the accepted base; ~60-190 art pixels added per strip; manifest and palette unchanged.

## Contact sheets (looked at)
- `img/cyc6-codex-shagtusk.jpg`, `img/cyc6-codex-sabrefang.jpg` (all 60 cells, anchor line red, seat dot green)
- `img/cyc6-codex-saddle-overlays.jpg` (each saddle frame composited on its mount frame)
- `img/cyc6-codex-icicle-bat-frost.jpg`

## Merge of the bat (commit on this branch)
Merged `origin/codex/b03-icicle-bat-frost-detail` like 0d4d12b (the first Icicle Bat merge): registration in INDEX.json only, status stays
`provisional`, note updated with the review; code fallbacks unchanged, NOT wired: `tests/shared-mm-creature-strips.test.js` pins
`kindsFor('tundra') === 'pengling,frostfox,rimewolf'` (not edited; blocker stands). The only conflict was Codex's status paragraph at the end
of CODEX-REMAKE-QUEUE.md (kept both).

Tests run (`node game/tests/run-all.js --port 9607 --files ...` via /tmp/bt.sh): art-integration, art-audit-tool, art-mini-art,
shared-mm-creature-strips, shared-mm-creatures, beta-s06-art-cache, shared-mm-biomes: **7 passed, 0 failed**.

## Not run / limits
- The full `run-all.js` suite was not run (time box); only the art and creature-list tests above.
- No in-game screenshot of the bat: it is not wired, so the game still draws the code bat.
- The three failed branches were not merged, so no in-engine test of mounts or saddle seats was possible.
