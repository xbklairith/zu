# Check 05's interaction in Safari

## Overview

Feature 05's harness (`web/e2e/accept.mjs`) passes in Chromium, Firefox and
WebKit, but WebKit isn't Safari. These checks need a person with Safari. They
cover the same ground as the harness: the page is opened from `file://`, and ELK
runs in an inline `blob:` worker.

## Prerequisites

- [ ] Safari, with Develop → Show Web Inspector enabled
- [ ] `make build` done at the repository root
- [ ] `git` history includes `0aaff9c` and `23a3e08`

## Steps

1. Export the pages:

   ```bash
   T=$(mktemp -d)
   bin/zu scan internal/scan/testdata/shop -out $T/shop.json -html $T/shop.html -include ./internal/...
   bin/zu diff 0aaff9c 23a3e08 -html $T/zu-change.html
   open -a Safari $T/shop.html
   ```

2. Open the Web Inspector on the Console tab before interacting.
3. In `shop.html`:
   - The canvas draws 10 nodes, and the console shows no CSP error.
   - Press `/`, type `Repo.Get` and press Enter. The view focuses `store`, the
     `.Get` row is highlighted and centred, and the address bar ends
     `#f=…store&s=…Repo.Get`.
   - Press `d` five times. The button reads "Declutter arrows", "Remove arrows",
     "Declutter elements", "Declutter classes" and then "Declutter none". Press
     `d` once more and reload. The page comes back with "Declutter arrows".
   - Tick "hide edges". The lines become triangles on the boxes.
   - Press `f`. The whole scene fits the canvas.
4. Open `$T/zu-change.html`:
   - Click `zu/internal/cli` in "Changed packages". The panel opens and the
     package is centred in the remaining canvas.
   - In the panel, click `zu/internal/gitref`. The header now says "Showing
     every package" and gitref is centred.

## Verification

Record the results in `docx/features/05-interaction/acceptance.md` under
"Pending manual checks", as passed or with what differed.

## Troubleshooting

- **"Layout failed: layout worker failed: blocked":** Safari refused the
  `blob:` worker. Copy the CSP error from the console into the acceptance
  record. Don't edit the page.
- **The address bar doesn't change on `file://`:** some browsers refuse
  `history.replaceState` for `file://` pages. The view still changes (plan,
  Deviation 5). Note it in the record.
