# Lantern bug bash

## Fixed (bb-lantern)
- First screen was 481 words; the class picker printed all 11 unlock rules under the dropdown and "What is a Fall?" was always open. Now ~273 visible words, 40 before the first primary button; unlock rules and Fall explainer live in a closed "Help" disclosure.
- 16 empty stash slots were Tab stops; now skipped (aria-disabled).

## Checked, OK
Hostile/corrupt saves (garbage, null, array, bad hero fields, XSS name, 500-item stash): no errors, no overflow. Landscape 844x390, reduced motion, 390px: no overflow, no errors. Start run passes ?hero=<id> and sets pixeltown-mm-active-v1. Festival lane has only bugs.* files (not mine).

## Elsewhere
- Realm HUD for a level-1 Herald (Lantern shows LIFE 130) shows HP 108/108 and label "Lv 1 Wave 1", not "Realm Lv" (mad-maze lane / realm-world.js).

## Open
- Start run button sits below hero cards, and is disabled with no hero while Create hero is further down; a first-time player must scroll past it (low).
- Hero cards show a full stat block each, making the Heroes card long (low).
