# Pixeltown art pipeline (game/tools/art)

Unattended, resumable hero-art pipeline: spec -> prompt -> image API -> code post-processing -> validation -> critic -> repo.
Python 3 + pillow + numpy (system python is fine). No secrets: the environment proxy injects the API key, no auth header is ever set.

## Spend cap (read this first)
* `config.json` is the ONLY place for the cap: `cap_total_usd` (4.00, TOTAL over all ledger rows) and `stop_usd` (3.60).
  After changing it run `python3 game/tools/art/generate.py --sync-header` (rewrites only the ledger header text).
* Cost is estimated at the high prices (out $40/M, in-text $5/M, in-image $10/M). The ledger parser sums the table rows of
  `game/assets/art/LEDGER-OPENAI.md`; before every call `ledger total + estimate <= stop_usd` or the run PAUSES (exit 3).
* Every attempt (success or failure) is appended as a ledger row; a network timeout is counted at the full estimate (billing unknown).
* Real calls need `--live`; without it every tool behaves as `--dry-run`. Today: 1.9645 spent, so only ~1.63 USD (about 17 images)
  remain; a full b02 batch (24 images, ~2.17) does NOT fit and run_batch pauses until the owner raises the cap.

## Files
| file | purpose |
|---|---|
| `specs/*.json`, `specs/spec.schema.json` | six class specs (b02 rogue/warlock/paladin, b03 berserker/druid/necromancer), example enemy + item; `specs/build_specs.py` regenerates them |
| `spec_lib.py` | mini schema validator + semantic checks (`spec_lib.py validate`): frame counts = b00, hexes in the shared b00+b01 palette |
| `prompt_builder.py` | deterministic prompt: STYLE + spec + views + poses + LAYOUT + PROVEN FIXES + [REQUIRED on retry] + NEGATIVE |
| `PROMPT-NOTES.md` | proven fixes, auto-included; add a bullet whenever a prompt wording fixed a defect |
| `generate.py` | API calls, cap, ledger rows, backoff on 429/5xx, resumable state, `--dry-run` |
| `process.py` | chroma key, connected-component frames, scale, snap to 64x64 grid, palette, strips, manifest entries, muzzle |
| `critic.py` | `prepare <batch> <class>` (contact sheet + request) and `apply <verdict.json>` (validate, retry plan) |
| `run_batch.py` | orchestrator, resumable |
| `synth_sheet.py` | draws synthetic test sheets (not game art) |

## Run
```
python3 game/tools/art/spec_lib.py validate
python3 game/tools/art/prompt_builder.py rogue attack [--retry "fix hint"]
python3 game/tools/art/generate.py --batch b02 --dry-run [--show-prompts]
python3 game/tools/art/run_batch.py b02 --dry-run
python3 game/tools/art/run_batch.py b02 --live          # real; resume by running it again
node game/tests/art-pipeline.test.js
```
Layout: ONE image = ONE action of ONE class, frames as columns, rows = down, up, right (1536x1024, magenta #FF00FF background);
the class master is a 1024x1024 three-view turnaround. Outputs go to `work/<batch>/` (git-ignored), final files to
`game/assets/arcane/<id>-<label>/` + `INDEX.json`.

## Flow with the critic
1. `run_batch.py b02 --live` generates, processes, validates and writes `work/b02/<class>/contact-sheet.png` + `critic-request.json`, then exits 4 (WAITING).
2. The orchestrator runs a Sonnet subagent on the request and saves `work/b02/<class>/verdict.json` (`{verdict, defects:[{strip,frame,defect,fix_hint}]}`).
3. `critic.py apply work/b02/<class>/verdict.json` stores `qa-verdict.json` and `retry-plan.json` (only failing strips; their action sheet is
   regenerated with the hints in a REQUIRED block; max 2 retries per strip, then `known_issues`).
4. Re-run `run_batch.py b02 --live`. When all classes are PASS / known-issues only, it files the batch.

## Processing notes
* Scale: ONE factor per sheet row (= per view), from the median height of the spec's standing reference frames -> 148 px; never per frame.
  (Each generated image has its own arbitrary raw scale, so a single factor per class is not measurable; per-view also equalises the three views.)
* Weapon colours (`weapon.region_hexes`) are exempt from the dark-outline recolour; muzzle = weapon-coloured pixel farthest from the torso point,
  fallback silhouette extreme (reported as an issue). Muzzles still need in-engine calibration.
* Validation reuses `game/tools/ingest-art-zip.py` `check_asset` when that file exists in the checkout, else an equivalent local check.
* Hero palettes: hexes come from the b00+b01 palette union; processing quantises to the class palette.
