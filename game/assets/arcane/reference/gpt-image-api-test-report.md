# Pixeltown asset pipeline test (OpenAI Images API)

Run: 2026-11-18. 3 generations used (the first call with `gpt-image-1` was rejected "model does not exist", no image produced; not retried with that name).

## What worked
- Proxy-injected auth works: plain curl with no Authorization header.
- `GET /v1/models` lists image models: gpt-image-2, gpt-image-2.5-*, gpt-image-2.6-*, gpt-image-1.5, gpt-image-1-mini, chatgpt-image-latest. Used `gpt-image-1.5` (not the newest; the 2.x variants were not tried).
- Pillow in system python is broken (`_imaging` ImportError); a venv (`arttest/venv`) with pip-installed Pillow 13.0.0 works. Run the script with `venv/bin/python`.
- `background: transparent` produced real alpha (about 85% of pixels alpha 0) for the character; item likewise processed fine.

## Latency (1024x1024)
- character 23.2 s, item 11.4 s, tile 12.6 s.

## Working request
```
POST https://api.openai.com/v1/images/generations
Content-Type: application/json
{"model":"gpt-image-1.5","prompt":"<subject>. pixel art, 24x24 sprite style, limited palette, flat colours, no anti-aliasing, no outline blur, centered, plain transparent background","size":"1024x1024","background":"transparent","output_format":"png"}
```
Response: data[0].b64_json (PNG). For tiles `background` was `opaque` and the style suffix replaced with "fills the entire square edge to edge, seamless tileable, top-down".

## Quality verdict (see contact-sheet.png, tile-3x3.png)
- Character (villager with lantern): PARTIAL. Reads as a readable pixel hero, but the house style (24x24 big-head chibi, bold 1px black outline, 3-6 flat colours per area, clean shapes) is not matched: it is a 12-colour, smaller-headed, noisily shaded figure in dark browns with soft-dithered lantern glow, looking like a different (higher-detail) art style. The raw image also had a glow/shadow halo (semi-transparent pixels) that had to be thresholded.
- Item (iron pickaxe): GOOD-ish. Clear silhouette and nice glow idea, but the head came out blue/diamond-like rather than iron, with orange speckle pixels (spark noise) that become stray pixels at 24x24. Usable after cleanup.
- Tile (mossy stone): FAIL for seamlessness. Not tileable: visible horizontal banding/seams, mismatched edges, noisy. The "pixels" of the raw image are about 16-32 px blocks with soft edges, so NEAREST from 1024 to 16 samples one arbitrary pixel per cell and gives noise instead of clean 16x16 art.

## Problems found
- Model-name drift: gpt-image-1 absent; must query /v1/models.
- Backgrounds: transparency honoured, but with soft halo/glow alpha (870k px alpha<10, ~3.7k partial) needing a threshold.
- Blur / fake pixels: GPT draws "pixel art" at an arbitrary grid (about 20-40 px blocks), not on 24 px; outputs have soft edges and gradients. NEAREST directly from 1024 gives jitter.
- Palette drift: model uses many near-colours; 16-colour quantisation fixed counts (12/10/16) but colours are darker and more saturated than the house palette.
- Size: cropping to the bbox then fitting to 24x24 makes characters smaller/less chunky than the game's heads-and-shoulders sprites; no common proportions.
- Tile seamlessness is not honoured by the model.

## Recommendations
1. Pipeline: generate at 1024, auto-detect the model's native pixel grid (or downscale with BOX/LANCZOS to 64x64 first, then NEAREST/quantise to the target), threshold alpha at ~50%, remove isolated single pixels, then quantise to <=16 colours, ideally mapped to a fixed Pixeltown palette (extract it from i/*-strip.png) to stop drift.
2. Prompt templates:
   - character: "pixel art character sprite, front view, chibi big head, thick 1px black outline, 3 flat colours per area, no gradients, no dithering, no glow, no shadow, centered on transparent background, <subject>".
   - item: "pixel art game item icon, single object, bold black outline, flat colours, no sparkles or particles, no dithering, transparent background, <subject>".
   - tile: "seamless tileable top-down pixel art texture, flat colours, no outlines near the edges, pattern continues across all four edges, <subject>"; and enforce seamlessness in post (offset by half and in-paint/blend, or generate a 2x2 and keep the centre), or generate tiles procedurally instead of via GPT.
3. Use the reference style: pass a few existing strips via `/v1/images/edits` as style references (not tested here).
4. Rejection checklist: not fully transparent bg / halo remaining; >16 colours after quantise; subject bbox smaller than ~70% of the frame; stray pixels (components of 1 px not touching main body); outline missing; tile edge-difference above threshold (compare left/right and top/bottom column colours); any real franchise character likeness; no text or watermark. Review contact sheet on mid-grey before accepting.
5. Budget about 12-25 s and one call per asset; plan 2-3 candidates per asset and pick the best.
6. Pin the model by name in config, with a fallback via /v1/models.
