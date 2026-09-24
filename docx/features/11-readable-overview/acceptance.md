# 11 · A readable overview — acceptance

Measured 2026-09-25 on an Apple M2 (8 cores, 16 GB), macOS, Go 1.24.5, Node 24.17.0,
with `bin/zu` built by `make build` after Task 7 (`aa76ed2`).

**Commits:**

| Task | Commit | What it did |
|---|---|---|
| 1 | `5a23176` | ranks |
| 2 | `0ace414` | rank rows |
| 3 | `3908ede` | short labels |
| 4 | `a15d6ea` | edge mode |
| 5 | `02324a2` | home |
| 6 | `d0e36e2` | readable fit, minimap, stats and axis, with amendments A1 and A2 |
| 7 | `aa76ed2` | browser suite, with amendment A3 |

Each task's failing step failed before its code went in, and its passing step passed
after.

## Gates

- **Task 8's chain:** exit 0.
  - `gofmt -l`: none.
  - `go vet ./...`, and `go test ./...` (11 packages ok).
  - `golangci-lint run ./...`: no output.
  - `npm run typecheck`, and 193 vitest tests in 25 files.
- **`npm run accept`:** 47/47 in chromium, firefox and webkit, in each of 3 runs.
- **`npm run accept-serve`:** 5/5 in each engine.

## Amendments at approval

- **A1 (no clipped box text).** The prototype's `mount-utils` was not clipped.
  - `k8s.io/mount-utils` is one package, so its stats line has no "· N pkgs" part.
    Its whole line, "uses 1 · used by 1", was drawn in full.
  - The "uses 1" was the externals oval being counted, which is A2.
  - `layout.test.ts` now sizes a box labelled `mount-utils` for both "uses 1 · used by 1"
    and "uses 1 · used by 1 · 12 pkgs". The case passed without a code change, and stays
    as a guard.
  - **In the browser:** the kubernetes and hugo pages, with the whole scene fitted, have
    no `.label` or `.stats` whose `scrollWidth` exceeds its `clientWidth`, in all three
    engines. e2e `firstView` checks the same on `wide.html`.
- **A2 ("uses N" counts project boxes only).** `scene.ts` `connect` no longer counts an
  end drawn as the externals oval (or an external module) or as the outside box.
  - A new `scene.test.ts` case gives a bottom-row box that uses only an external module
    "uses 0 · used by 1". Focused below home, a box that uses only the rest of the
    project reads "uses 0 · used by 0".
  - Each of the two exclusions was shown red on its own before the fix.
  - **In the pages:**
    - `mount-utils` reads "uses 0 · used by 1";
    - `apimachinery` reads "uses 1 · used by 26 · 98 pkgs" (the prototype had "uses 2");
    - `hugolib` reads "uses 23 · used by 11 · 9 pkgs" (the prototype had 24).
  - **A box's lines and its stats can now differ by its external lines.** Hovering
    `hugolib` still draws 24 lines out, the 24th going to the externals oval. The
    `selectLines` check is unaffected, because big.html has no externals.
  - **Reading "sibling boxes only":** this counts project boxes in other containers too.
    A same-parent reading would drop every dependency between containers from the
    stats, and they would then disagree with the lines a selected box draws (Deviation
    17, M1).
- **A3.** The `firstView` check says that `wide.html#d=2` forces the minimap and is a
  test of wrapping, clipping and the minimap, not a realistic first view.

## The default views, `measure.mjs` at 1600 × 1000

`bin/zu scan` exported the Test Corpus checkouts `hugo@v0.166.0` and
`kubernetes@v1.37.0`, read-only (`git status` clean afterwards), into scratch.

| | engine | zoom | smallest label | lines at rest | boxes in view / total | minimap | hover | CSP or page errors |
|---|---|---|---|---|---|---|---|---|
| hugo | chromium | 0.917 | 11 px | 0 | 31 / 38 | shown | `hugolib`: 24 out, 11 in | 0 |
| hugo | firefox | 0.917 | 11 px | 0 | 30 / 38 | shown | `hugolib`: 24 out, 11 in | 0 |
| hugo | webkit | 0.917 | 11 px | 0 | 31 / 38 | shown | `hugolib`: 24 out, 11 in | 0 |
| kubernetes | chromium | 1.035 | 12.4 px | 0 | 39 / 39 | not needed | `kubelet`: 4 out, 2 in | 0 |
| kubernetes | firefox | 1.031 | 12.4 px | 0 | 39 / 39 | not needed | `kubelet`: 4 out, 2 in | 0 |
| kubernetes | webkit | 1.038 | 12.5 px | 0 | 39 / 39 | not needed | `kubelet`: 4 out, 2 in | 0 |

**The header notes:**
- hugo: "260 dependencies hidden; select or hover a box to see its own." and "39
  dependencies run against the order."
- kubernetes: "175 dependencies hidden; …", with no count against the order (0).

**Where the pages open:**
- hugo opens at home, `github.com/gohugoio/hugo`, at depth 1.
- kubernetes opens at the root (38 module roots, so no home), at depth 1, with
  `k8s.io/` dropped from every label.
- The header names the commits the exports were scanned at: hugo `78400b4de8ad`, and
  kubernetes `f54c212e3a2f` (`k8s.io/api`, `k8s.io/apiextensions-apiserver`,
  `k8s.io/apimachinery` +35).
- The screenshots show the hubs that the plan's Deviation 15 names: `common`, `config`
  and `hugofs` on hugo, and `api`, `apimachinery` and `client-go` on kubernetes. A2
  doesn't move them, because no external is ever the user of a project box.

**Against the plan's Prototype evidence:** these are its numbers in every column except
the stats that A2 changes.

**On-screen coverage:**
- hugo shows 31 of its 38 boxes whole (30 in firefox), and the minimap and a pan reach
  the rest.
- kubernetes shows all 39 boxes whole, with no minimap. The plan's M5 counts its rows
  as 11 ranks in 13.

**Screenshots** (`shots/`, 1600 × 1000):
- the default views, `hugo-{engine}.png` and `k8s-{engine}.png`;
- hovering `hugolib` and `kubelet`, `hugo-hover-{engine}.png` and `k8s-hover-{engine}.png`;
- `{engine}` is chromium, firefox or webkit.

## 09's paint numbers are historical

09's acceptance.md measured first paint with `web/e2e/paint.mjs`. Its "default, edges
on" row loaded the bare page, which drew every line then.

Under 11 the bare page is `auto`, and kubernetes' 175 lines are over `EDGE_LIMIT`, so
it would draw none. Task 7 changed paint.mjs's usage to name `#l=1` for that row.

09's numbers were measured before 11, on 09's layout, and are not re-measured here.
Read them as historical.

## Doc amendments (Deviation 13)

- **`decisions.md` UI v1:** "500 laid-out edges" becomes "500 drawn lines", and the
  Readable overview (11) text is added.
- **`glossary.md`:** gains **Architecture Rank** after **Level**.
- **`decisions.md` Serve (10):** now calls watch feature 13, as renumbered at approval
  (grouping is 12).

## Risks

- A box's stats and the lines it draws when selected or hovered can differ by one: the
  line to the externals oval is drawn, but "uses N" doesn't count it (A2; accepted at
  review). `hugolib` reads "uses 23" and draws 24 lines out.

## Pending, by a person

The plan's last step is the user's check: open `hugo.html` and `k8s.html`. Can you
tell what depends on what within 10 seconds? It has not been run.
