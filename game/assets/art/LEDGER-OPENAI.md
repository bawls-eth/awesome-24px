# OpenAI art ledger (TOTAL cap 4.00 USD, stop at 3.60, report at 3.20)
Cap fields: TOTAL cap = 4.00 USD for ALL rows below (not per day); work STOPS at 3.60; a report is due at 3.20. Estimated at the high prices below. Single source: game/tools/art/config.json (cap_total_usd, stop_usd, report_usd).
Model gpt-image-1.5, Images API /v1/images/edits with reference images, quality medium, background transparent.
Cost estimate uses deliberately high prices: output $40/M, input text $5/M, input image $10/M.
Totals are computed from the rows below.

| id | model | size | quality | usage tokens | est. cost USD | note |
|---|---|---|---|---|---|---|
| bramble_archer | gpt-image-1.5 | 1536x1024 | medium | out 2065, in text 164, in image 775 | 0.0912 | UNUSABLE: first attempt used the labelled preview.png as reference and copied its text and grey background; redo with clean magenta-keyed reference |
| bramble_archer | gpt-image-1.5 | 1536x1024 | medium | out 1984, in text 168, in image 775 | 0.0880 | |
| bramble_archer (edits, clean ref) | gpt-image-1.5 | 1536x1024 | medium | out 1984, in text 168, in image 775 | 0.0880 | UNUSABLE: /edits with reference images ignored the prompt (drew a red wizard and a turtle); switched to /v1/images/generations for all assets |
| bramble_archer (generations) | gpt-image-1.5 | 1536x1024 | medium | out 1982, in text 429, in image 0 | 0.0836 | used |
| frostcaller | gpt-image-1.5 | 1536x1024 | medium | out 1948, in text 319, in image 0 | 0.0795 | |
| ranger | gpt-image-1.5 | 1536x1024 | medium | out 2033, in text 341, in image 0 | 0.0830 | |
| queen_burrowmole | gpt-image-1.5 | 1536x1024 | medium | out 1927, in text 380, in image 0 | 0.0790 | |
| sprout | gpt-image-1.5 | 1536x1024 | medium | out 2065, in text 345, in image 0 | 0.0843 | |
| items | gpt-image-1.5 | 1536x1024 | medium | out 2034, in text 406, in image 0 | 0.0834 | |
| herald | gpt-image-1.5 | 1536x1024 | medium | out 1950, in text 326, in image 0 | 0.0796 | |
| grave_tender | gpt-image-1.5 | 1536x1024 | medium | out 2034, in text 325, in image 0 | 0.0830 | |
| trickster | gpt-image-1.5 | 1536x1024 | medium | out 2004, in text 325, in image 0 | 0.0818 | |
| loot_bags | gpt-image-1.5 | 1536x1024 | medium | out 2025, in text 279, in image 0 | 0.0824 | |
| lantern_props | gpt-image-1.5 | 1536x1024 | medium | out 1968, in text 328, in image 0 | 0.0804 | |
| fish_pond | gpt-image-1.5 | 1536x1024 | medium | out 2012, in text 365, in image 0 | 0.0823 | |
| fish_sea | gpt-image-1.5 | 1536x1024 | medium | out 2029, in text 393, in image 0 | 0.0831 | |
| bugs | gpt-image-1.5 | 1536x1024 | medium | out 1969, in text 351, in image 0 | 0.0805 | |
| items | gpt-image-1.5 | 1024x1024 | medium | out 1449, in text 435, in image 0 | 0.0601 | |
| bugs | gpt-image-1.5 | 1536x1024 | medium | out 1968, in text 381, in image 0 | 0.0806 | |
| loot_bags | gpt-image-1.5 | 1536x1024 | medium | out 2035, in text 293, in image 0 | 0.0829 | |
| frostcaller | gpt-image-1.5 | 1536x1024 | medium | out 1953, in text 337, in image 0 | 0.0798 | |
| fish_sea | gpt-image-1.5 | 1536x1024 | medium | out 2015, in text 393, in image 0 | 0.0826 | |
| fish_pond | gpt-image-1.5 | 1536x1024 | medium | out 2028, in text 365, in image 0 | 0.0829 | |
| bugs | gpt-image-1.5 | 1536x1024 | medium | out 2016, in text 381, in image 0 | 0.0825 | |

Notes: items, bugs, loot_bags, frostcaller were each regenerated once after an unusable first try (wrong grid / frame lines / missing frame); first tries are included in the rows above. fish_pond, fish_sea, bugs were then re-run once more by mistake with the unchanged prompt (a prompt tweak failed to apply); those runs are rows too and are counted.

TOTAL: 1.9645
