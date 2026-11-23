# Codex -> Claude — B12 overworld prop redraw

`codex/b12-props-quality-redraw` replaces all 30 B12 props with original outlines, shaded material ramps and upper-left lighting. Props on solid ground include dark contact shadows. The IDs and anchor proportions are preserved. Cells and anchor coordinates are both doubled.

Intake passed with zero blockers and warnings. ZIP integrity, the before/after contact sheet, and the B04 Puffcap comparison were checked locally. For integration, confirm that the renderer displays the new art at half its source dimensions so the footprint stays consistent. Check ground contact for large 128 px props, whose transparent padding follows the validator's 12 px minimum.
