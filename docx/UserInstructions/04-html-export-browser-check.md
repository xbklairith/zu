# Check the HTML Export in three browsers

## Overview

Feature 04's acceptance was run in Chrome through an automation extension. That
extension cannot open `file://` pages, and its tab was hidden, so three checks still
need a person: `file://` loading, Firefox and Safari, and a visible first-paint time.

## Prerequisites

- [ ] Chrome, Firefox and Safari installed
- [ ] The test corpus cloned (`scripts/bench-corpus.sh` puts it in `.zu/corpus/`)
- [ ] `make build` done at the repository root

## Steps

1. Export the three files:

   ```bash
   T=$(mktemp -d)
   bin/zu scan -out $T/zu.json -html $T/zu.html -include ./internal/...
   bin/zu scan .zu/corpus/hugo@v0.166.0 -out $T/hugo.json -html $T/hugo.html -include ./hugolib
   bin/zu scan .zu/corpus/kubernetes@v1.37.0 -out $T/k8s.json -html $T/k8s.html
   open $T
   ```

2. In each browser, open each file with File → Open, which gives a `file://` URL. Do
   this with the developer tools open on the Console and Network tabs.
3. For `k8s.html`, record the first paint:
   - Chrome: Performance panel, reload and record, then read FCP.
   - Or run `performance.getEntriesByType("paint")` in the console.
   - Also run `performance.getEntriesByType("mark")` to get `zu-drawn`.
4. Double-click a box, press Esc, and click a declaration in `zu.html` to see its
   source.

## Verification

- [ ] Console: no errors and no `Content-Security-Policy` violations
- [ ] Network: only the document itself
- [ ] `k8s.html` first paint under 3 s in every browser
- [ ] Drill-in, Esc and the source panel work in every browser

Add the results to `docx/features/04-html-export/acceptance.md`.

## Troubleshooting

- **Blank page, and the console says a module script was blocked:** some browsers
  restrict module scripts on `file://`. Record which browser. The fix would be to
  build the bundle as a classic script.
- **"This page carries no zu data":** the file is the bare UI template, not an export.
  Export again with `zu scan -html`.
